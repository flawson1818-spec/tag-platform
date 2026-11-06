import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { buildPaginationMeta, PaginatedResult, paginationRange } from '../common/pagination';
import { FilesService } from '../storage/files.service';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateSocialPostDto } from './dto/create-social-post.dto';
import { UpdateMemberProfileDto } from './dto/update-member-profile.dto';

/** Postgres undefined table/column, or PostgREST's "not in schema cache". */
const MISSING_CODES = new Set(['42P01', '42703', 'PGRST204', 'PGRST205']);
/** NOT NULL violation: posts.community_id before migration 20261107. */
const NOT_NULL_VIOLATION = '23502';
const UNAVAILABLE = "Le fil d'actualité n'est pas encore activé sur ce serveur.";
const MAX_PAGE = 30;

export interface MemberSummary {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface FeedPost {
  id: string;
  content: string;
  createdAt: string;
  edited: boolean;
  author: MemberSummary;
  community: { id: string; name: string } | null;
  photos: string[];
  amenCount: number;
  amenedByMe: boolean;
  commentCount: number;
  /** The viewer wrote it. */
  mine: boolean;
}

export interface MemberProfile extends MemberSummary {
  bio: string | null;
  churchName: string | null;
  city: string | null;
  memberSince: string;
  communities: { id: string; name: string; type: string }[];
  postCount: number;
  isMe: boolean;
}

interface PostRow {
  id: string;
  community_id: string | null;
  author_id: string;
  content: string;
  status: string;
  created_at: string;
  author: { id: string; display_name: string; avatar_file_id: string | null } | null;
  community: { id: string; name: string } | null;
}

const POST_SELECT =
  'id, community_id, author_id, content, status, created_at, author:author_id(id, display_name, avatar_file_id), community:community_id(id, name)';

/**
 * The Christian social network, step 1 (docs/01_FUNCTIONAL_SPECIFICATION.md §8, "comme un
 * réseau social"): a feed of posts with photos and "Amen", and a public profile per member.
 *
 * Built on the existing posts table: a personal post is one with no community. The feed shows
 * personal posts plus posts from the viewer's own communities. Profiles never expose e-mail or
 * phone. Everything new degrades gracefully before migration 20261107: reads fall back to what
 * exists, writes that need it answer 503.
 */
@Injectable()
export class SocialService {
  private readonly logger = new Logger(SocialService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly filesService: FilesService,
  ) {}

  private get db() {
    return this.supabase.client;
  }

  // ---- Feed ----

  async feed(viewerId: string, page = 1, limit = 20): Promise<PaginatedResult<FeedPost>> {
    const size = Math.min(MAX_PAGE, Math.max(1, limit));
    const { from, to } = paginationRange(page, size);
    const communities = await this.memberCommunityIds(viewerId);
    const scope = communities.length
      ? `community_id.is.null,community_id.in.(${communities.join(',')})`
      : 'community_id.is.null';

    const { data, error, count } = await this.db
      .from('posts')
      .select(POST_SELECT, { count: 'exact' })
      .is('deleted_at', null)
      .or(scope)
      .order('created_at', { ascending: false })
      .range(from, to);
    if (error) throw new InternalServerErrorException(error.message);

    return {
      data: await this.decorate((data ?? []) as unknown as PostRow[], viewerId),
      meta: buildPaginationMeta(page, size, count ?? 0),
    };
  }

  async memberPosts(memberId: string, viewerId: string, page = 1, limit = 20): Promise<PaginatedResult<FeedPost>> {
    await this.findActiveMember(memberId);
    const size = Math.min(MAX_PAGE, Math.max(1, limit));
    const { from, to } = paginationRange(page, size);
    const { data, error, count } = await this.db
      .from('posts')
      .select(POST_SELECT, { count: 'exact' })
      .eq('author_id', memberId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(from, to);
    if (error) throw new InternalServerErrorException(error.message);
    return {
      data: await this.decorate((data ?? []) as unknown as PostRow[], viewerId),
      meta: buildPaginationMeta(page, size, count ?? 0),
    };
  }

  async createPost(authorId: string, dto: CreateSocialPostDto): Promise<FeedPost> {
    const content = dto.content?.trim() ?? '';
    const photoIds = Array.from(new Set(dto.photoFileIds ?? []));
    if (!content && photoIds.length === 0) {
      throw new BadRequestException('Écris un message ou ajoute au moins une photo.');
    }
    if (dto.communityId && !(await this.isActiveMember(dto.communityId, authorId))) {
      throw new ForbiddenException('Tu dois être membre de cette communauté pour y publier.');
    }
    // Only the author's own images, fully uploaded (findById also checks ownership).
    for (const fileId of photoIds) {
      const file = await this.filesService.findById(fileId, authorId).catch(() => null);
      if (!file || file.status !== 'AVAILABLE' || !file.mime_type.startsWith('image/')) {
        throw new BadRequestException("Une des photos n'est pas disponible. Réessaie de l'ajouter.");
      }
    }

    const { data, error } = await this.db
      .from('posts')
      .insert({
        community_id: dto.communityId ?? null,
        author_id: authorId,
        content,
        status: 'PUBLISHED',
        created_by: authorId,
        updated_by: authorId,
      })
      .select('id')
      .single();
    if (error) {
      if (error.code === NOT_NULL_VIOLATION) throw new ServiceUnavailableException(UNAVAILABLE);
      throw new InternalServerErrorException(error.message);
    }
    const postId = (data as { id: string }).id;

    if (photoIds.length > 0) {
      const { error: photoError } = await this.db
        .from('post_photos')
        .insert(photoIds.map((fileId, position) => ({ post_id: postId, file_id: fileId, position })));
      if (photoError) {
        // Never leave a post without the photos it was published with.
        await this.db.from('posts').delete().eq('id', postId);
        if (MISSING_CODES.has(photoError.code ?? '')) throw new ServiceUnavailableException(UNAVAILABLE);
        throw new InternalServerErrorException(photoError.message);
      }
    }

    return this.findPost(postId, authorId);
  }

  async findPost(postId: string, viewerId: string): Promise<FeedPost> {
    const { data, error } = await this.db
      .from('posts')
      .select(POST_SELECT)
      .eq('id', postId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException(`Post ${postId} not found`);
    const [post] = await this.decorate([data as unknown as PostRow], viewerId);
    return post;
  }

  // ---- Amen ----

  async setAmen(postId: string, userId: string, amen: boolean): Promise<{ amenCount: number; amenedByMe: boolean }> {
    await this.findPost(postId, userId);
    const table = this.db.from('post_amens');
    const { error } = amen
      ? await table.upsert({ post_id: postId, user_id: userId }, { onConflict: 'post_id,user_id', ignoreDuplicates: true })
      : await table.delete().eq('post_id', postId).eq('user_id', userId);
    if (error) {
      if (MISSING_CODES.has(error.code ?? '')) throw new ServiceUnavailableException(UNAVAILABLE);
      throw new InternalServerErrorException(error.message);
    }
    const { count, error: countError } = await this.db
      .from('post_amens')
      .select('user_id', { count: 'exact', head: true })
      .eq('post_id', postId);
    if (countError) throw new InternalServerErrorException(countError.message);
    return { amenCount: count ?? 0, amenedByMe: amen };
  }

  // ---- Profiles ----

  async profile(memberId: string, viewerId: string): Promise<MemberProfile> {
    const member = await this.findActiveMember(memberId);

    const [details, communities, posts, avatars] = await Promise.all([
      this.db.from('user_profiles').select('bio, church_name, city').eq('user_id', memberId).maybeSingle(),
      this.db
        .from('community_members')
        .select('community:community_id(id, name, type, deleted_at)')
        .eq('user_id', memberId)
        .eq('status', 'ACTIVE'),
      this.db
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .eq('author_id', memberId)
        .is('deleted_at', null),
      this.filesService.getPublicReadUrls(member.avatar_file_id ? [member.avatar_file_id] : []),
    ]);

    // Fail-open: no user_profiles table yet just means an empty bio.
    const row = (details.error ? null : details.data) as { bio: string | null; church_name: string | null; city: string | null } | null;
    const communityRows = (communities.data ?? []) as unknown as {
      community: { id: string; name: string; type: string; deleted_at: string | null } | null;
    }[];

    return {
      id: member.id,
      displayName: member.display_name,
      avatarUrl: member.avatar_file_id ? (avatars.get(member.avatar_file_id) ?? null) : null,
      bio: row?.bio ?? null,
      churchName: row?.church_name ?? null,
      city: row?.city ?? null,
      memberSince: member.created_at,
      communities: communityRows
        .map((r) => r.community)
        .filter((c): c is { id: string; name: string; type: string; deleted_at: string | null } => !!c && !c.deleted_at)
        .map(({ id, name, type }) => ({ id, name, type })),
      postCount: posts.count ?? 0,
      isMe: memberId === viewerId,
    };
  }

  async updateMyProfile(userId: string, dto: UpdateMemberProfileDto): Promise<MemberProfile> {
    const patch: Record<string, string | null> = {};
    if (dto.bio !== undefined) patch.bio = dto.bio || null;
    if (dto.churchName !== undefined) patch.church_name = dto.churchName || null;
    if (dto.city !== undefined) patch.city = dto.city || null;

    const { error } = await this.db
      .from('user_profiles')
      .upsert({ user_id: userId, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) {
      if (MISSING_CODES.has(error.code ?? '')) throw new ServiceUnavailableException(UNAVAILABLE);
      throw new InternalServerErrorException(error.message);
    }
    return this.profile(userId, userId);
  }

  // ---- Helpers ----

  /** Adds photos, Amen and comment counts, and avatar URLs to a page of posts — a fixed number of queries per page. */
  private async decorate(rows: PostRow[], viewerId: string): Promise<FeedPost[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);

    const [photos, amens, comments] = await Promise.all([
      this.db.from('post_photos').select('post_id, file_id, position').in('post_id', ids),
      this.db.from('post_amens').select('post_id, user_id').in('post_id', ids),
      this.db.from('comments').select('post_id').in('post_id', ids).is('deleted_at', null),
    ]);
    // Before migration 20261107 photos/amens simply don't exist yet.
    const photoRows = (photos.error ? [] : (photos.data ?? [])) as { post_id: string; file_id: string; position: number }[];
    const amenRows = (amens.error ? [] : (amens.data ?? [])) as { post_id: string; user_id: string }[];
    const commentRows = (comments.error ? [] : (comments.data ?? [])) as { post_id: string }[];
    if (comments.error) this.logger.warn(`Comment counts unavailable: ${comments.error.message}`);

    const urls = await this.filesService.getPublicReadUrls([
      ...photoRows.map((p) => p.file_id),
      ...rows.map((r) => r.author?.avatar_file_id ?? ''),
    ]);

    return rows.map((row) => {
      const postPhotos = photoRows
        .filter((p) => p.post_id === row.id)
        .sort((a, b) => a.position - b.position)
        .map((p) => urls.get(p.file_id))
        .filter((u): u is string => Boolean(u));
      const postAmens = amenRows.filter((a) => a.post_id === row.id);
      return {
        id: row.id,
        content: row.content,
        createdAt: row.created_at,
        edited: row.status === 'EDITED',
        author: {
          id: row.author_id,
          displayName: row.author?.display_name ?? 'Membre',
          avatarUrl: row.author?.avatar_file_id ? (urls.get(row.author.avatar_file_id) ?? null) : null,
        },
        community: row.community ? { id: row.community.id, name: row.community.name } : null,
        photos: postPhotos,
        amenCount: postAmens.length,
        amenedByMe: postAmens.some((a) => a.user_id === viewerId),
        commentCount: commentRows.filter((c) => c.post_id === row.id).length,
        mine: row.author_id === viewerId,
      };
    });
  }

  private async memberCommunityIds(userId: string): Promise<string[]> {
    const { data, error } = await this.db
      .from('community_members')
      .select('community_id')
      .eq('user_id', userId)
      .eq('status', 'ACTIVE');
    if (error) throw new InternalServerErrorException(error.message);
    return ((data ?? []) as { community_id: string }[]).map((r) => r.community_id);
  }

  private async isActiveMember(communityId: string, userId: string): Promise<boolean> {
    const { data, error } = await this.db
      .from('community_members')
      .select('community_id')
      .eq('community_id', communityId)
      .eq('user_id', userId)
      .eq('status', 'ACTIVE')
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    return Boolean(data);
  }

  private async findActiveMember(
    id: string,
  ): Promise<{ id: string; display_name: string; avatar_file_id: string | null; created_at: string }> {
    const { data, error } = await this.db
      .from('users')
      .select('id, display_name, avatar_file_id, created_at')
      .eq('id', id)
      .eq('status', 'ACTIVE')
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException('Ce membre est introuvable.');
    return data as { id: string; display_name: string; avatar_file_id: string | null; created_at: string };
  }
}
