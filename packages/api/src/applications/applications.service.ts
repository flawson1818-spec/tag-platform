import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { NotificationsService } from '../communication/notifications.service';
import { CommunitiesService } from '../communities/communities.service';
import { RolesService } from '../roles/roles.service';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateApplicationDto, ReviewApplicationDto } from './dto/applications.dto';

const MISSING = new Set(['42P01', '42703', 'PGRST204', 'PGRST205']);
const UNAVAILABLE = "Les candidatures ne sont pas encore activées : lance la migration 20261113 dans Supabase.";
const COLUMNS =
  'id, kind, applicant_id, status, payload, review_note, reviewed_at, community_id, created_at, applicant:applicant_id(display_name)';

export type ApplicationKind = 'INTERCESSOR' | 'COMMUNITY';

export interface Application {
  id: string;
  kind: ApplicationKind;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  payload: Record<string, unknown>;
  reviewNote: string | null;
  reviewedAt: string | null;
  communityId: string | null;
  createdAt: string;
  applicant: { id: string; displayName: string };
}

interface Row {
  id: string;
  kind: ApplicationKind;
  applicant_id: string;
  status: Application['status'];
  payload: Record<string, unknown> | null;
  review_note: string | null;
  reviewed_at: string | null;
  community_id: string | null;
  created_at: string;
  applicant: { display_name: string } | null;
}

function toApplication(row: Row): Application {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    payload: row.payload ?? {},
    reviewNote: row.review_note,
    reviewedAt: row.reviewed_at,
    communityId: row.community_id,
    createdAt: row.created_at,
    applicant: { id: row.applicant_id, displayName: row.applicant?.display_name ?? 'Membre' },
  };
}

/**
 * Applications from the pilot V1 (cahier des charges unifié §5.4). A member applies to become
 * an intercessor, or registers their church or group; nothing changes until the administration
 * decides. Approving an intercessor gives the Intercesseur role; approving a community creates
 * it with the applicant as its leader (Responsable d'équipe for that community).
 */
@Injectable()
export class ApplicationsService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly rolesService: RolesService,
    private readonly communitiesService: CommunitiesService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private get db() {
    return this.supabase.client.from('applications');
  }

  private fail(error: { code?: string; message: string }): never {
    if (MISSING.has(error.code ?? '')) throw new ServiceUnavailableException(UNAVAILABLE);
    if (error.code === '23505') throw new ConflictException('Tu as déjà une candidature en attente.');
    throw new InternalServerErrorException(error.message);
  }

  async apply(applicantId: string, dto: CreateApplicationDto): Promise<Application> {
    const payload = dto.kind === 'INTERCESSOR' ? dto.intercessor : dto.community;
    if (!payload) throw new BadRequestException('Le formulaire de candidature est incomplet.');
    if (dto.kind === 'INTERCESSOR') {
      const roles = await this.rolesOf(applicantId);
      if (['INTERCESSEUR', 'MODERATEUR', 'RESPONSABLE_EQUIPE', 'PASTEUR', 'ADMINISTRATEUR', 'SUPER_ADMINISTRATEUR'].some((r) => roles.has(r))) {
        throw new ConflictException('Tu es déjà intercesseur (ou plus).');
      }
    }
    const { data, error } = await this.db
      .insert({ kind: dto.kind, applicant_id: applicantId, payload })
      .select(COLUMNS)
      .single();
    if (error) this.fail(error);
    return toApplication(data as unknown as Row);
  }

  async mine(applicantId: string): Promise<Application[]> {
    const { data, error } = await this.db.select(COLUMNS).eq('applicant_id', applicantId).order('created_at', { ascending: false });
    if (error) {
      if (MISSING.has(error.code ?? '')) return [];
      this.fail(error);
    }
    return ((data ?? []) as unknown as Row[]).map(toApplication);
  }

  async list(status?: string, kind?: string): Promise<Application[]> {
    let query = this.db.select(COLUMNS).order('created_at', { ascending: false }).limit(100);
    if (status) query = query.eq('status', status);
    if (kind) query = query.eq('kind', kind);
    const { data, error } = await query;
    if (error) {
      if (MISSING.has(error.code ?? '')) return [];
      this.fail(error);
    }
    return ((data ?? []) as unknown as Row[]).map(toApplication);
  }

  async review(id: string, dto: ReviewApplicationDto, reviewerId: string): Promise<Application> {
    const { data, error } = await this.db.select(COLUMNS).eq('id', id).maybeSingle();
    if (error) this.fail(error);
    if (!data) throw new NotFoundException('Candidature introuvable.');
    const application = toApplication(data as unknown as Row);
    if (application.status !== 'PENDING') throw new ConflictException('Cette candidature a déjà été traitée.');

    let communityId: string | null = null;
    if (dto.status === 'APPROVED') {
      if (application.kind === 'INTERCESSOR') {
        await this.rolesService.assign({ userId: application.applicant.id, roleCode: 'INTERCESSEUR' } as never, reviewerId);
      } else {
        const p = application.payload as { name: string; type: string };
        const community = await this.communitiesService.create({ name: p.name, type: p.type } as never, reviewerId);
        communityId = community.id;
        await this.communitiesService.addMember(community.id, { userId: application.applicant.id, internalRole: 'Responsable' } as never);
        await this.rolesService.assign(
          { userId: application.applicant.id, roleCode: 'RESPONSABLE_EQUIPE', communityId: community.id } as never,
          reviewerId,
        );
      }
    }

    const { data: updated, error: updateError } = await this.db
      .update({
        status: dto.status,
        review_note: dto.note || null,
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
        community_id: communityId,
      })
      .eq('id', id)
      .select(COLUMNS)
      .single();
    if (updateError) this.fail(updateError);

    await this.notificationsService
      .create(application.applicant.id, `APPLICATION_${dto.status}`, { applicationId: id, kind: application.kind, communityId })
      .catch(() => null);
    return toApplication(updated as unknown as Row);
  }

  private async rolesOf(userId: string): Promise<Set<string>> {
    const { data } = await this.supabase.client
      .from('role_assignments')
      .select('roles(code)')
      .eq('user_id', userId)
      .is('community_id', null);
    return new Set(((data ?? []) as unknown as { roles: { code: string } | null }[]).map((r) => r.roles?.code ?? ''));
  }
}
