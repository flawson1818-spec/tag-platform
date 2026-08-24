import {
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
import { FilesService } from '../storage/files.service';
import { SupabaseService } from '../supabase/supabase.service';
import { CreatePrayerRequestDto } from './dto/create-prayer-request.dto';
import { ListPrayerRequestsQueryDto } from './dto/list-prayer-requests.query.dto';
import { PromotePrayerRequestDto } from './dto/promote-prayer-request.dto';
import { PrayerRequest, PrayerRequestStatus } from './prayer-request.entity';
import { PrayerSlotsService } from './prayer-slots.service';
import { assertRequestTransition } from './prayer-state-machines';

const REQUEST_COLUMNS =
  'id, author_id, category, description, photo_file_id, attachment_file_id, confidentiality, status, promoted_slot_id, created_at, updated_at, deleted_at';

/** Moderator-only view — adds the IA Modératrice flag fields kept out of REQUEST_COLUMNS (public listings never expose them). */
const FLAGGED_REQUEST_COLUMNS = `${REQUEST_COLUMNS}, ai_flag_reason, ai_flag_confidence`;

const DEFAULT_PROMOTED_SLOT_DURATION_SECONDS = 300;

/**
 * Prayer requests use a different, more personal category set than prayer slots
 * (docs/01_FUNCTIONAL_SPECIFICATION.md sections 3.1 vs 5.1). Promotion needs a concrete
 * mapping since the DB spec calls for "attribution automatique de la catégorie" without
 * spelling one out — this is the mapping used.
 */
const REQUEST_TO_SLOT_CATEGORY: Record<string, string> = {
  Maladie: 'Guérison',
  Mariage: 'Mariage',
  Emploi: 'Finances',
  Études: 'Jeunesse',
  Visa: 'Autre',
  Enfant: 'Famille',
  Délivrance: 'Urgence',
  Famille: 'Famille',
  Autre: 'Autre',
};

@Injectable()
export class PrayerRequestsService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly slotsService: PrayerSlotsService,
    private readonly notificationsService: NotificationsService,
    private readonly pushNotificationsService: PushNotificationsService,
    private readonly aiModerationService: AiModerationService,
    private readonly aiAgentsService: AiAgentsService,
    private readonly filesService: FilesService,
  ) {}

  private get db() {
    return this.supabase.client.from('prayer_requests');
  }

  async create(
    dto: CreatePrayerRequestDto,
    authorId: string | null,
    canCreatePublic: boolean,
  ): Promise<PrayerRequest> {
    let confidentiality = dto.confidentiality ?? 'ANONYMOUS';
    if (confidentiality !== 'ANONYMOUS' && (!authorId || !canCreatePublic)) {
      confidentiality = 'ANONYMOUS';
    }
    const storedAuthorId = confidentiality === 'ANONYMOUS' ? null : authorId;
    const moderation = await this.aiModerationService.moderate(dto.description, storedAuthorId);

    const { data, error } = await this.db
      .insert({
        author_id: storedAuthorId,
        category: dto.category,
        description: dto.description,
        confidentiality,
        status: 'NEW',
        photo_file_id: dto.photoFileId ?? null,
        attachment_file_id: dto.attachmentFileId ?? null,
        ai_flagged: moderation.flagged,
        ai_flag_reason: moderation.reason,
        ai_flag_confidence: moderation.confidence,
        created_by: storedAuthorId,
        updated_by: storedAuthorId,
      })
      .select(REQUEST_COLUMNS)
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return data as unknown as PrayerRequest;
  }

  /**
   * A request's photo/attachment follows the request's own visibility rule (PRIVATE requires
   * canSeePrivate, same as findById) rather than the uploader's file ownership — matches the
   * testimony media pattern in prayer-testimonies.service.ts.
   */
  async getMediaUrl(id: string, kind: 'photo' | 'attachment', canSeePrivate: boolean): Promise<string> {
    const request = await this.findById(id, canSeePrivate);
    const fileId = kind === 'photo' ? request.photo_file_id : request.attachment_file_id;
    if (!fileId) throw new NotFoundException(`Prayer request ${id} has no ${kind}`);

    const url = await this.filesService.getPublicReadUrl(fileId);
    if (!url) throw new NotFoundException('Media not available yet');
    return url;
  }

  /** Moderator-only: every prayer request ever flagged by IA Modératrice. */
  async listFlagged(): Promise<(PrayerRequest & { ai_flag_reason: string | null; ai_flag_confidence: number | null })[]> {
    const { data, error } = await this.db
      .select(FLAGGED_REQUEST_COLUMNS)
      .eq('ai_flagged', true)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw new InternalServerErrorException(error.message);
    return data as unknown as (PrayerRequest & { ai_flag_reason: string | null; ai_flag_confidence: number | null })[];
  }

  async findById(id: string, canSeePrivate: boolean): Promise<PrayerRequest> {
    const { data, error } = await this.db
      .select(REQUEST_COLUMNS)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    const request = data as unknown as PrayerRequest | null;
    if (!request || (request.confidentiality === 'PRIVATE' && !canSeePrivate)) {
      throw new NotFoundException(`Prayer request ${id} not found`);
    }
    return request;
  }

  async list(
    query: ListPrayerRequestsQueryDto,
    canSeePrivate: boolean,
  ): Promise<PaginatedResult<PrayerRequest>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { from, to } = paginationRange(page, limit);

    let request = this.db
      .select(REQUEST_COLUMNS, { count: 'exact' })
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(from, to);
    if (!canSeePrivate) request = request.neq('confidentiality', 'PRIVATE');
    if (query.status) request = request.eq('status', query.status);
    if (query.category) request = request.eq('category', query.category);

    const { data, error, count } = await request;
    if (error) throw new InternalServerErrorException(error.message);

    return { data: data as unknown as PrayerRequest[], meta: buildPaginationMeta(page, limit, count ?? 0) };
  }

  async updateStatus(
    id: string,
    status: PrayerRequestStatus,
    currentUserId: string,
    canManageStatus: boolean,
  ): Promise<PrayerRequest> {
    const request = await this.findById(id, true);
    const isOwnerEditingWhileNew = request.status === 'NEW' && request.author_id === currentUserId;
    if (!isOwnerEditingWhileNew && !canManageStatus) {
      throw new ForbiddenException('Permission denied');
    }
    assertRequestTransition(request.status, status);

    const { data, error } = await this.db
      .update({ status, updated_by: currentUserId })
      .eq('id', id)
      .select(REQUEST_COLUMNS)
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    const updated = data as unknown as PrayerRequest;

    if (status === 'ANSWERED' && updated.author_id) {
      // See docs/01_FUNCTIONAL_SPECIFICATION.md section 11 — "Réponse à une demande de prière".
      await this.notificationsService.create(updated.author_id, 'PRAYER_REQUEST_ANSWERED', {
        prayerRequestId: updated.id,
      });
      await this.pushNotificationsService.send(
        updated.author_id,
        'Ta demande a été exaucée',
        'La communauté a prié pour toi — découvre la réponse sur TAG.',
      );
    }

    return updated;
  }

  async promote(id: string, dto: PromotePrayerRequestDto, actorId: string): Promise<PrayerRequest> {
    const request = await this.findById(id, true);
    assertRequestTransition(request.status, 'ASSIGNED');

    const guidedText = await this.aiAgentsService
      .draftGuidedPrayer(request.category, request.description)
      .catch(
        () =>
          `[Texte généré automatiquement par l'IA Intercession — à valider] Prions pour : ${request.description}`,
      );

    const slot = await this.slotsService.create(dto.programId, {
      title: `${request.category} — demande de prière`,
      category: REQUEST_TO_SLOT_CATEGORY[request.category] ?? 'Autre',
      startAt: new Date().toISOString(),
      endAt: new Date(Date.now() + DEFAULT_PROMOTED_SLOT_DURATION_SECONDS * 1000).toISOString(),
      guidedText,
    });

    const { data, error } = await this.db
      .update({ status: 'ASSIGNED', promoted_slot_id: slot.id, updated_by: actorId })
      .eq('id', id)
      .select(REQUEST_COLUMNS)
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return data as unknown as PrayerRequest;
  }
}
