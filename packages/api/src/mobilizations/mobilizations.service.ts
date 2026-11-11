import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PermissionsService } from '../access/permissions.service';
import { NotificationsService } from '../communication/notifications.service';
import { SupabaseService } from '../supabase/supabase.service';

export const MOBILIZATION_STATUSES = ['INVITED', 'ACCEPTED', 'DECLINED', 'DONE'] as const;
export type MobilizationStatus = (typeof MOBILIZATION_STATUSES)[number];

const MANAGE_REQUESTS = 'prayer_request.manage_status';
const COMMUNITY_MANAGE = 'community.manage';
const MISSING = new Set(['42P01', 'PGRST205', '42703', 'PGRST204']);
const UNAVAILABLE = "La mobilisation des groupes n'est pas encore activée : lance la migration 20261117 dans Supabase.";

/** Where an invitation can go next: the group answers, then says when it has carried it. */
const NEXT: Record<MobilizationStatus, MobilizationStatus[]> = {
  INVITED: ['ACCEPTED', 'DECLINED'],
  ACCEPTED: ['DONE'],
  DECLINED: [],
  DONE: [],
};

export interface Mobilization {
  id: string;
  status: MobilizationStatus;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  community: { id: string; name: string; type: string };
  /** The request as the group sees it: never its author. */
  request: { id: string; category: string; description: string; status: string };
}

interface Row {
  id: string;
  status: MobilizationStatus;
  note: string | null;
  invited_by: string | null;
  created_at: string;
  updated_at: string;
  prayer_request_id: string;
  community_id: string;
  community: { id: string; name: string; type: string } | null;
  request: { id: string; category: string; description: string; status: string } | null;
}

const SELECT =
  'id, status, note, invited_by, created_at, updated_at, prayer_request_id, community_id, community:community_id(id, name, type), request:prayer_request_id(id, category, description, status)';

/**
 * Mobilising a group on a prayer request (cahier des charges unifié §5.6, pilote V13): besides
 * an intercessor, the administration may entrust a request to a church, a cell or a team. The
 * group's leaders are notified and answer (accept / decline), then mark it carried. Members of
 * the group see the requests their group accepted, so they pray for them too — never who wrote
 * them.
 */
@Injectable()
export class MobilizationsService {
  private readonly logger = new Logger(MobilizationsService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly permissionsService: PermissionsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private get db() {
    return this.supabase.client;
  }

  async invite(requestId: string, communityId: string, actorId: string, note?: string): Promise<Mobilization> {
    await this.assertGlobal(actorId, MANAGE_REQUESTS);
    const { data: request } = await this.db.from('prayer_requests').select('id').eq('id', requestId).is('deleted_at', null).maybeSingle();
    if (!request) throw new NotFoundException('Demande introuvable.');
    const { data: community } = await this.db.from('communities').select('id').eq('id', communityId).is('deleted_at', null).maybeSingle();
    if (!community) throw new NotFoundException('Groupe introuvable.');

    const { data, error } = await this.db
      .from('prayer_request_mobilizations')
      .insert({ prayer_request_id: requestId, community_id: communityId, status: 'INVITED', note: note?.trim() || null, invited_by: actorId })
      .select(SELECT)
      .single();
    if (error) {
      if (error.code === '23505') throw new ConflictException('Ce groupe est déjà mobilisé sur cette demande.');
      this.fail(error);
    }
    const mobilization = this.toView(data as unknown as Row);
    void this.notifyLeaders(communityId, mobilization);
    return mobilization;
  }

  async listForRequest(requestId: string, actorId: string): Promise<Mobilization[]> {
    await this.assertGlobal(actorId, MANAGE_REQUESTS);
    const { data, error } = await this.db
      .from('prayer_request_mobilizations')
      .select(SELECT)
      .eq('prayer_request_id', requestId)
      .order('created_at', { ascending: true });
    if (error) return MISSING.has(error.code ?? '') ? [] : this.fail(error);
    return (data as unknown as Row[]).map((r) => this.toView(r));
  }

  /** A group's subjects: leaders see every invitation, members what the group accepted. */
  async listForCommunity(communityId: string, viewerId: string): Promise<{ canAnswer: boolean; items: Mobilization[] }> {
    const canAnswer = (await this.permissionsService.getUserPermissionCodes(viewerId, communityId)).has(COMMUNITY_MANAGE);
    if (!canAnswer) {
      const { data: member } = await this.db
        .from('community_members')
        .select('status')
        .eq('community_id', communityId)
        .eq('user_id', viewerId)
        .maybeSingle();
      if ((member as { status?: string } | null)?.status !== 'ACTIVE') return { canAnswer: false, items: [] };
    }
    let query = this.db.from('prayer_request_mobilizations').select(SELECT).eq('community_id', communityId);
    if (!canAnswer) query = query.in('status', ['ACCEPTED', 'DONE']);
    const { data, error } = await query.order('created_at', { ascending: false }).limit(100);
    if (error) return MISSING.has(error.code ?? '') ? { canAnswer, items: [] } : this.fail(error);
    return { canAnswer, items: (data as unknown as Row[]).map((r) => this.toView(r)) };
  }

  async answer(id: string, status: MobilizationStatus, actorId: string, note?: string): Promise<Mobilization> {
    const row = await this.findRow(id);
    const permissions = await this.permissionsService.getUserPermissionCodes(actorId, row.community_id);
    if (!permissions.has(COMMUNITY_MANAGE)) throw new ForbiddenException('Seuls les responsables du groupe peuvent répondre.');
    if (!NEXT[row.status].includes(status)) {
      throw new BadRequestException(`Impossible de passer de « ${row.status} » à « ${status} ».`);
    }
    const { data, error } = await this.db
      .from('prayer_request_mobilizations')
      .update({ status, note: note?.trim() || row.note, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(SELECT)
      .single();
    if (error) this.fail(error);
    const mobilization = this.toView(data as unknown as Row);
    if (row.invited_by) {
      void this.notificationsService
        .create(row.invited_by, 'PRAYER_MOBILIZATION_ANSWERED', {
          prayerRequestId: row.prayer_request_id,
          communityId: row.community_id,
          communityName: mobilization.community.name,
          status,
        })
        .catch(() => undefined);
    }
    return mobilization;
  }

  async withdraw(id: string, actorId: string): Promise<void> {
    await this.assertGlobal(actorId, MANAGE_REQUESTS);
    await this.findRow(id);
    const { error } = await this.db.from('prayer_request_mobilizations').delete().eq('id', id);
    if (error) this.fail(error);
  }

  // ---- helpers ----

  private async findRow(id: string): Promise<Row> {
    const { data, error } = await this.db.from('prayer_request_mobilizations').select(SELECT).eq('id', id).maybeSingle();
    if (error) this.fail(error);
    if (!data) throw new NotFoundException('Mobilisation introuvable.');
    return data as unknown as Row;
  }

  private async assertGlobal(userId: string, permission: string): Promise<void> {
    if (!(await this.permissionsService.getUserPermissionCodes(userId)).has(permission)) {
      throw new ForbiddenException(`Missing permission: ${permission}`);
    }
  }

  /** The group's leaders: members holding a role in it (Responsable…). */
  private async notifyLeaders(communityId: string, mobilization: Mobilization): Promise<void> {
    try {
      const { data } = await this.db
        .from('community_members')
        .select('user_id, internal_role')
        .eq('community_id', communityId)
        .eq('status', 'ACTIVE')
        .not('internal_role', 'is', null);
      for (const leader of (data ?? []) as { user_id: string }[]) {
        await this.notificationsService.create(leader.user_id, 'PRAYER_MOBILIZATION_INVITED', {
          communityId,
          communityName: mobilization.community.name,
          mobilizationId: mobilization.id,
        });
      }
    } catch (error) {
      this.logger.warn(`Mobilization notifications failed: ${(error as Error).message}`);
    }
  }

  private toView(row: Row): Mobilization {
    return {
      id: row.id,
      status: row.status,
      note: row.note,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      community: row.community ?? { id: row.community_id, name: 'Groupe', type: 'GROUP' },
      request: row.request ?? { id: row.prayer_request_id, category: 'Autre', description: '', status: 'NEW' },
    };
  }

  private fail(error: { code?: string; message: string }): never {
    if (MISSING.has(error.code ?? '')) throw new ServiceUnavailableException(UNAVAILABLE);
    throw new InternalServerErrorException(error.message);
  }
}
