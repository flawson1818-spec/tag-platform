import { ForbiddenException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { buildPaginationMeta, PaginatedResult, paginationRange } from '../common/pagination';
import { SupabaseService } from '../supabase/supabase.service';
import { Comment } from './comment.entity';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CreatePostDto } from './dto/create-post.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { Post } from './post.entity';

const POST_COLUMNS = 'id, community_id, author_id, content, status, created_at, updated_at, deleted_at';
const COMMENT_COLUMNS = 'id, post_id, author_id, content, status, created_at, updated_at, deleted_at';

@Injectable()
export class PostsService {
  constructor(private readonly supabase: SupabaseService) {}

  async isCommunityMember(communityId: string, userId: string): Promise<boolean> {
    const { data, error } = await this.supabase.client
      .from('community_members')
      .select('community_id')
      .eq('community_id', communityId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    return Boolean(data);
  }

  async createPost(communityId: string, authorId: string, dto: CreatePostDto): Promise<Post> {
    const isMember = await this.isCommunityMember(communityId, authorId);
    if (!isMember) throw new ForbiddenException('Only community members can post');

    const { data, error } = await this.supabase.client
      .from('posts')
      .insert({
        community_id: communityId,
        author_id: authorId,
        content: dto.content,
        status: 'PUBLISHED',
        created_by: authorId,
        updated_by: authorId,
      })
      .select(POST_COLUMNS)
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return data as unknown as Post;
  }

  async listForCommunity(
    communityId: string,
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<Post>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { from, to } = paginationRange(page, limit);

    const { data, error, count } = await this.supabase.client
      .from('posts')
      .select(POST_COLUMNS, { count: 'exact' })
      .eq('community_id', communityId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(from, to);
    if (error) throw new InternalServerErrorException(error.message);

    return { data: data as unknown as Post[], meta: buildPaginationMeta(page, limit, count ?? 0) };
  }

  async findPostById(id: string): Promise<Post> {
    const { data, error } = await this.supabase.client
      .from('posts')
      .select(POST_COLUMNS)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException(`Post ${id} not found`);
    return data as unknown as Post;
  }

  async createComment(postId: string, authorId: string, dto: CreateCommentDto): Promise<Comment> {
    const post = await this.findPostById(postId);
    const isMember = await this.isCommunityMember(post.community_id, authorId);
    if (!isMember) throw new ForbiddenException('Only community members can comment');

    const { data, error } = await this.supabase.client
      .from('comments')
      .insert({
        post_id: postId,
        author_id: authorId,
        content: dto.content,
        status: 'CREATED',
        created_by: authorId,
        updated_by: authorId,
      })
      .select(COMMENT_COLUMNS)
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return data as unknown as Comment;
  }

  async listComments(postId: string, query: PaginationQueryDto): Promise<PaginatedResult<Comment>> {
    await this.findPostById(postId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { from, to } = paginationRange(page, limit);

    const { data, error, count } = await this.supabase.client
      .from('comments')
      .select(COMMENT_COLUMNS, { count: 'exact' })
      .eq('post_id', postId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .range(from, to);
    if (error) throw new InternalServerErrorException(error.message);

    return { data: data as unknown as Comment[], meta: buildPaginationMeta(page, limit, count ?? 0) };
  }
}
