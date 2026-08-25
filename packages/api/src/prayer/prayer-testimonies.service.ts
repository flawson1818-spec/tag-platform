import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { buildPaginationMeta, PaginatedResult, paginationRange } from '../common/pagination';
import { AiAgentsService } from '../ai/ai-agents.service';
import { AiModerationService } from '../ai/ai-moderation.service';
import { NotificationsService } from '../communication/notifications.service';
import { PushNotificationsService } from '../communication/push-notifications.service';
import { SOCIAL_CHANNELS } from '../communication/social-publication.entity';
import { SocialPublicationsService } from '../communication/social-publications.service';
import { FilesService } from '../storage/files.service';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateTestimonyDto } from './dto/create-testimony.dto';
import { ListTestimoniesQueryDto } from './dto/list-testimonies.query.dto';
import { UpdateTestimonyDto } from './dto/update-testimony.dto';
import { Testimony } from './testimony.entity';

const TESTIMONY_COLUMNS =
  'id, author_id, related_request_id, media_type, content, file_id, status, moderated_by, moderation_reason, ai_flagged, ai_flag_reason, ai_flag_confidence, created_at, updated_at, deleted_at';

@Injectable()
export class PrayerTestimoniesService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly notificationsService: NotificationsService,
    private readonly pushNotificationsService: PushNotificationsService,
    private readonly socialPublicationsService: SocialPublicationsService,
    private readonly aiModerationService: AiModerationService,
    private readonly aiAgentsService: AiAgentsService,
    private readonly filesService: FilesService,
  ) {}

  private get db() {
    return this.supabase.client.from('testimonies');
  }

  async create(dto: CreateTestimonyDto, authorId: string): Promise<Testimony> {
    const mediaType = dto.mediaType ?? 'TEXT';
    if (mediaType === 'TEXT' && !dto.content) {
      throw new BadRequestException('content is required for a TEXT testimony');
    }
    if (mediaType !== 'TEXT' && !dto.fileId) {
      throw new BadRequestException('fileId is required for a non-TEXT testimony');
    }

    const moderation = dto.content
      ? await this.aiModerationService.moderate(dto.content, authorId)
      : { flagged: false, confidence: 0, reason: null };

    const { data, error } = await this.db
      .insert({
        author_id: authorId,
        related_request_id: dto.relatedRequestId ?? null,
        media_type: mediaType,
        content: dto.content ?? null,
        file_id: dto.fileId ?? null,
        status: 'DRAFT',
        ai_flagged: moderation.flagged,
        ai_flag_reason: moderation.reason,
        ai_flag_confidence: moderation.confidence,
        created_by: authorId,
        updated_by: authorId,
      })
      .select(TESTIMONY_COLUMNS)
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return data as unknown as Testimony;
  }

  /**
   * docs/07_UX_UI_SPECIFICATION.md §6 — a rejected testimony is notified to its author "avec
   * possibilité de resoumettre". There was no update path at all before this: a rejection left
   * the row stuck at DRAFT with moderation_reason set, and the author's only option was creating
   * an unrelated new testimony from scratch. Editing clears the rejection (clean slate for
   * re-review) and re-runs moderation only when the content actually changed.
   */
  async update(id: string, dto: UpdateTestimonyDto, authorId: string): Promise<Testimony> {
    const testimony = await this.findById(id);
    if (testimony.author_id !== authorId) throw new ForbiddenException('Permission denied');
    if (testimony.status !== 'DRAFT') {
      throw new ConflictException(`Testimony ${id} can no longer be edited`);
    }

    const moderation = dto.content
      ? await this.aiModerationService.moderate(dto.content, authorId)
      : { flagged: testimony.ai_flagged, confidence: testimony.ai_flag_confidence ?? 0, reason: testimony.ai_flag_reason };

    const { data, error } = await this.db
      .update({
        media_type: dto.mediaType ?? testimony.media_type,
        content: dto.content ?? testimony.content,
        file_id: dto.fileId ?? testimony.file_id,
        moderated_by: null,
        moderation_reason: null,
        ai_flagged: moderation.flagged,
        ai_flag_reason: moderation.reason,
        ai_flag_confidence: moderation.confidence,
        updated_by: authorId,
      })
      .eq('id', id)
      .select(TESTIMONY_COLUMNS)
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return data as unknown as Testimony;
  }

  async findById(id: string): Promise<Testimony> {
    const { data, error } = await this.db.select(TESTIMONY_COLUMNS).eq('id', id).is('deleted_at', null).maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    const testimony = data as unknown as Testimony | null;
    if (!testimony) throw new NotFoundException(`Testimony ${id} not found`);
    return testimony;
  }

  /**
   * A PUBLISHED testimony's media is visible to anyone who can see the testimony itself, not
   * just its author — files.service.ts's owner-only findById would otherwise 404 for every
   * viewer except the uploader, so this goes through the owner-agnostic getPublicReadUrl and
   * enforces its own visibility rule instead (published, moderator, or the author).
   */
  async getMediaUrl(id: string, requesterId: string | null, canModerate: boolean): Promise<string> {
    const testimony = await this.findById(id);
    if (!testimony.file_id) throw new NotFoundException(`Testimony ${id} has no media`);
    const isVisible = testimony.status === 'PUBLISHED' || canModerate || testimony.author_id === requesterId;
    if (!isVisible) throw new ForbiddenException('Permission denied');

    const url = await this.filesService.getPublicReadUrl(testimony.file_id);
    if (!url) throw new NotFoundException('Media not available yet');
    return url;
  }

  /**
   * Public: for the unauthenticated Accueil screen's "témoignages récents" feed
   * (07_UX_UI_SPECIFICATION §1). Deliberately narrow shape — no author_id, moderation
   * fields, or AI-flag metadata, since this is served without any permission check.
   */
  async listRecentPublished(limit: number): Promise<Pick<Testimony, 'id' | 'media_type' | 'content' | 'created_at'>[]> {
    const capped = Math.min(Math.max(limit, 1), 20);
    const { data, error } = await this.db
      .select('id, media_type, content, created_at')
      .eq('status', 'PUBLISHED')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(capped);
    if (error) throw new InternalServerErrorException(error.message);
    return data as unknown as Pick<Testimony, 'id' | 'media_type' | 'content' | 'created_at'>[];
  }

  /** Moderator-only: every testimony ever flagged by IA Modératrice, regardless of status. */
  async listFlagged(): Promise<Testimony[]> {
    const { data, error } = await this.db
      .select(TESTIMONY_COLUMNS)
      .eq('ai_flagged', true)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw new InternalServerErrorException(error.message);
    return data as unknown as Testimony[];
  }

  async list(
    query: ListTestimoniesQueryDto,
    canModerate: boolean,
    currentUserId?: string,
  ): Promise<PaginatedResult<Testimony>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { from, to } = paginationRange(page, limit);

    let request = this.db
      .select(TESTIMONY_COLUMNS, { count: 'exact' })
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(from, to);
    if (query.mine && currentUserId) {
      // Owner sees every one of their own testimonies, any status (including a rejected DRAFT).
      request = request.eq('author_id', currentUserId);
      if (query.status) request = request.eq('status', query.status);
    } else {
      request = canModerate && query.status ? request.eq('status', query.status) : request.eq('status', 'PUBLISHED');
    }

    const { data, error, count } = await request;
    if (error) throw new InternalServerErrorException(error.message);

    return { data: data as unknown as Testimony[], meta: buildPaginationMeta(page, limit, count ?? 0) };
  }

  async approve(id: string, moderatorId: string): Promise<Testimony> {
    const testimony = await this.getModeratable(id);
    const { data, error } = await this.db
      .update({ status: 'PUBLISHED', moderated_by: moderatorId, moderation_reason: null, updated_by: moderatorId })
      .eq('id', testimony.id)
      .select(TESTIMONY_COLUMNS)
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    const published = data as unknown as Testimony;

    await this.notificationsService.create(published.author_id, 'TESTIMONY_PUBLISHED', {
      testimonyId: published.id,
    });
    await this.pushNotificationsService.send(
      published.author_id,
      'Témoignage publié',
      'Ton témoignage a été validé et publié sur TAG.',
    );
    await this.draftSocialPublications(published);

    return published;
  }

  async reject(id: string, moderatorId: string, reason: string): Promise<Testimony> {
    const testimony = await this.getModeratable(id);
    const { data, error } = await this.db
      .update({ moderated_by: moderatorId, moderation_reason: reason, updated_by: moderatorId })
      .eq('id', testimony.id)
      .select(TESTIMONY_COLUMNS)
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    const rejected = data as unknown as Testimony;

    await this.notificationsService.create(rejected.author_id, 'TESTIMONY_REJECTED', {
      testimonyId: rejected.id,
      reason,
    });
    await this.pushNotificationsService.send(rejected.author_id, 'Témoignage non retenu', reason);

    return rejected;
  }

  /**
   * See docs/01_FUNCTIONAL_SPECIFICATION.md section 6.3 and docs/02_AI_AGENTS_SPECIFICATION.md
   * section 6 — IA Communication drafts a publication per channel from a validated testimony;
   * every draft still requires human approval before publishing (SocialPublicationsService always
   * creates it as DRAFT). Falls back to a clearly-marked placeholder per channel if the model call
   * fails (e.g. ANTHROPIC_API_KEY not configured) so testimony approval never breaks on this.
   */
  private async draftSocialPublications(testimony: Testimony): Promise<void> {
    const content = testimony.content ?? 'Un témoignage a été partagé sur TAG.';
    await Promise.all(
      SOCIAL_CHANNELS.map(async (channel) => {
        const draftContent = await this.aiAgentsService
          .draftSocialPost(channel, content)
          .catch(() => `[Brouillon généré automatiquement par l'IA Communication — à valider] ${content}`);
        await this.socialPublicationsService.create({ channel, draftContent, testimonyId: testimony.id });
      }),
    );
  }

  private async getModeratable(id: string): Promise<Testimony> {
    const { data, error } = await this.db
      .select(TESTIMONY_COLUMNS)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    const testimony = data as unknown as Testimony | null;
    if (!testimony) throw new NotFoundException(`Testimony ${id} not found`);
    if (testimony.status !== 'DRAFT') {
      throw new ConflictException(`Testimony ${id} is not pending moderation`);
    }
    return testimony;
  }
}
