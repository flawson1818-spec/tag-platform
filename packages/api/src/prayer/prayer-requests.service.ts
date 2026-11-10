import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
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
import { toRoomId } from './prayer-constants';
import { PrayerProgramsService } from './prayer-programs.service';
import { PrayerRealtimeGateway } from './prayer-realtime.gateway';
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
    private readonly programsService: PrayerProgramsService,
    private readonly gateway: PrayerRealtimeGateway,
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

  /**
   * A member only ever sees their own requests (or, as an intercessor, the ones entrusted to
   * them). The administration — prayer_request.manage_status — receives and sees all of them.
   */
  async list(
    query: ListPrayerRequestsQueryDto,
    canManage: boolean,
    currentUserId?: string,
  ): Promise<PaginatedResult<PrayerRequest>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { from, to } = paginationRange(page, limit);

    const build = (columns: string) => {
      let request = this.db
        .select(columns, { count: 'exact' })
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .range(from, to);
      if (query.assignedToMe && currentUserId) {
        request = request.eq('assigned_to', currentUserId);
      } else if (query.mine || !canManage) {
        // An ANONYMOUS submission has no author_id (see create()), so it never shows up here.
        request = request.eq('author_id', currentUserId ?? '00000000-0000-0000-0000-000000000000');
      }
      if (query.status) request = request.eq('status', query.status);
      if (query.category) request = request.eq('category', query.category);
      return request;
    };

    // The administration also sees who asked and who carries it (fail-open before migration 20261111).
    const extended = `${REQUEST_COLUMNS}, assigned_to, assigned_at, author:author_id(display_name), assignee:assigned_to(display_name)`;
    let { data, error, count } = await build(canManage ? extended : `${REQUEST_COLUMNS}, assigned_to`);
    if (error && ['42703', 'PGRST200', 'PGRST204'].includes(error.code ?? '')) {
      if (query.assignedToMe) return { data: [], meta: buildPaginationMeta(page, limit, 0) };
      ({ data, error, count } = await build(REQUEST_COLUMNS));
    }
    if (error) throw new InternalServerErrorException(error.message);

    const rows = (data ?? []) as unknown as (PrayerRequest & {
      author?: { display_name: string } | null;
      assignee?: { display_name: string } | null;
    })[];
    return {
      data: rows.map(({ author, assignee, ...rest }) => ({
        ...rest,
        ...(canManage
          ? {
              author_display_name: rest.confidentiality === 'ANONYMOUS' ? null : (author?.display_name ?? null),
              assignee_display_name: assignee?.display_name ?? null,
            }
          : {}),
      })) as PrayerRequest[],
      meta: buildPaginationMeta(page, limit, count ?? 0),
    };
  }

  /** Who may open one request: the administration, its author, or the intercessor carrying it. */
  async findForViewer(id: string, viewerId: string, canManage: boolean): Promise<PrayerRequest> {
    const request = await this.findById(id, true);
    if (canManage || request.author_id === viewerId) return request;
    const { data } = await this.db.select('assigned_to').eq('id', id).maybeSingle();
    if ((data as { assigned_to?: string | null } | null)?.assigned_to === viewerId) return request;
    throw new NotFoundException(`Prayer request ${id} not found`);
  }

  /** The administration entrusts a request to an intercessor (or takes it back with null). */
  async assign(id: string, assigneeId: string | null, actorId: string): Promise<PrayerRequest> {
    const request = await this.findById(id, true);
    const patch: Record<string, unknown> = {
      assigned_to: assigneeId,
      assigned_at: assigneeId ? new Date().toISOString() : null,
      updated_by: actorId,
    };
    if (assigneeId && request.status === 'NEW') {
      assertRequestTransition(request.status, 'ASSIGNED');
      patch.status = 'ASSIGNED';
    }
    const { data, error } = await this.db.update(patch).eq('id', id).select(REQUEST_COLUMNS).single();
    if (error) {
      if (['42703', 'PGRST204'].includes(error.code ?? '')) {
        throw new ServiceUnavailableException(
          "L'assignation des demandes n'est pas encore activée : lance la migration 20261111 dans Supabase.",
        );
      }
      throw new InternalServerErrorException(error.message);
    }
    if (assigneeId) {
      await this.notificationsService
        .create(assigneeId, 'PRAYER_REQUEST_ASSIGNED', { prayerRequestId: id })
        .catch(() => null);
      await this.pushNotificationsService
        .send(assigneeId, 'Une demande de prière t\u2019est confiée', 'Ouvre Tour d\u2019avant-garde pour la porter dans la prière.')
        .catch(() => undefined);
    }
    return data as unknown as PrayerRequest;
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
        'La communauté a prié pour toi — découvre la réponse sur Tour d\'avant-garde.',
      );
    }

    return updated;
  }

  /**
   * "Promoting" a request means it becomes the room's urgent topic right now (07_UX_UI_SPECIFICATION.md
   * §4 "injection d'un sujet d'urgence") — not a normal future-scheduled slot. A plain
   * slotsService.create() with startAt=now would almost always collide with whatever is already
   * RUNNING in a continuously-looping room, so this goes through injectUrgent() instead, which
   * cuts the current slot short first, and then broadcasts the change immediately rather than
   * waiting for the engine's next tick to notice.
   */
  async promote(id: string, dto: PromotePrayerRequestDto, actorId: string): Promise<PrayerRequest> {
    const request = await this.findById(id, true);
    assertRequestTransition(request.status, 'ASSIGNED');

    const guidedText = await this.aiAgentsService
      .draftGuidedPrayer(request.category, request.description)
      .catch(
        () =>
          `[Texte généré automatiquement par l'IA Intercession — à valider] Prions pour : ${request.description}`,
      );

    const { interrupted, activated } = await this.slotsService.injectUrgent(dto.programId, {
      title: `${request.category} — demande de prière`,
      category: REQUEST_TO_SLOT_CATEGORY[request.category] ?? 'Autre',
      guidedText,
      durationSeconds: DEFAULT_PROMOTED_SLOT_DURATION_SECONDS,
    });

    const program = await this.programsService.findById(dto.programId);
    const roomId = toRoomId(program.community_id);
    if (interrupted) this.gateway.emitSlotEnded(roomId, interrupted.id);
    this.gateway.emitSlotStarted(roomId, activated, DEFAULT_PROMOTED_SLOT_DURATION_SECONDS);

    const { data, error } = await this.db
      .update({ status: 'ASSIGNED', promoted_slot_id: activated.id, updated_by: actorId })
      .eq('id', id)
      .select(REQUEST_COLUMNS)
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return data as unknown as PrayerRequest;
  }
}
