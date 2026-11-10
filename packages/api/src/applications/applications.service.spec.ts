import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { createQueryChain, createSupabaseServiceMock } from '../testing/supabase-query-mock';
import { ApplicationsService } from './applications.service';

const ROW = {
  id: 'app-1',
  kind: 'INTERCESSOR',
  applicant_id: 'u-1',
  status: 'PENDING',
  payload: { motivation: 'Je veux porter les nations dans la prière.' },
  review_note: null,
  reviewed_at: null,
  community_id: null,
  created_at: '2026-11-10T10:00:00Z',
  applicant: { display_name: 'Esther' },
};

function build(tables: Record<string, unknown>) {
  const rolesService = { assign: vi.fn().mockResolvedValue(undefined) };
  const communitiesService = {
    create: vi.fn().mockResolvedValue({ id: 'c-new' }),
    addMember: vi.fn().mockResolvedValue(undefined),
  };
  const notificationsService = { create: vi.fn().mockResolvedValue(null) };
  const service = new ApplicationsService(
    createSupabaseServiceMock(tables as never) as never,
    rolesService as never,
    communitiesService as never,
    notificationsService as never,
  );
  return { service, rolesService, communitiesService, notificationsService };
}

describe('ApplicationsService', () => {
  it('a member applies to become an intercessor; nothing changes before the decision', async () => {
    const { service, rolesService } = build({
      role_assignments: createQueryChain({ data: [{ roles: { code: 'VISITEUR' } }], error: null }),
      applications: createQueryChain({ data: ROW, error: null }),
    });
    const app = await service.apply('u-1', { kind: 'INTERCESSOR', intercessor: { motivation: ROW.payload.motivation } });
    expect(app).toMatchObject({ status: 'PENDING', applicant: { displayName: 'Esther' } });
    expect(rolesService.assign).not.toHaveBeenCalled();
  });

  it('refuses a second application from someone who is already an intercessor', async () => {
    const { service } = build({ role_assignments: createQueryChain({ data: [{ roles: { code: 'INTERCESSEUR' } }], error: null }) });
    await expect(service.apply('u-1', { kind: 'INTERCESSOR', intercessor: { motivation: 'x'.repeat(20) } })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('approving an intercessor gives the Intercesseur role and tells them', async () => {
    const { service, rolesService, notificationsService } = build({
      applications: [createQueryChain({ data: ROW, error: null }), createQueryChain({ data: { ...ROW, status: 'APPROVED' }, error: null })],
    });
    await service.review('app-1', { status: 'APPROVED' }, 'admin-1');
    expect(rolesService.assign).toHaveBeenCalledWith({ userId: 'u-1', roleCode: 'INTERCESSEUR' }, 'admin-1');
    expect(notificationsService.create).toHaveBeenCalledWith('u-1', 'APPLICATION_APPROVED', expect.objectContaining({ applicationId: 'app-1' }));
  });

  it('approving a church creates it with the applicant as its leader', async () => {
    const church = { ...ROW, kind: 'COMMUNITY', payload: { name: 'Église de la Grâce', type: 'CHURCH', country: 'Togo' } };
    const { service, rolesService, communitiesService } = build({
      applications: [createQueryChain({ data: church, error: null }), createQueryChain({ data: { ...church, status: 'APPROVED' }, error: null })],
    });
    await service.review('app-1', { status: 'APPROVED' }, 'admin-1');
    expect(communitiesService.create).toHaveBeenCalledWith({ name: 'Église de la Grâce', type: 'CHURCH' }, 'admin-1');
    expect(communitiesService.addMember).toHaveBeenCalledWith('c-new', { userId: 'u-1', internalRole: 'Responsable' });
    expect(rolesService.assign).toHaveBeenCalledWith({ userId: 'u-1', roleCode: 'RESPONSABLE_EQUIPE', communityId: 'c-new' }, 'admin-1');
  });

  it('a decision is final', async () => {
    const { service } = build({ applications: createQueryChain({ data: { ...ROW, status: 'REJECTED' }, error: null }) });
    await expect(service.review('app-1', { status: 'APPROVED' }, 'admin-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('before the migration: empty lists, applying says not yet activated', async () => {
    const missing = createQueryChain({ data: null, error: { code: '42P01', message: 'missing' } });
    const { service } = build({ applications: missing, role_assignments: createQueryChain({ data: [], error: null }) });
    await expect(service.mine('u-1')).resolves.toEqual([]);
    await expect(service.apply('u-1', { kind: 'COMMUNITY', community: { name: 'X', type: 'CHURCH', country: 'Togo' } })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
