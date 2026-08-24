import { RolesService } from './roles.service';
import { createQueryChain, createSupabaseServiceMock } from '../testing/supabase-query-mock';

const PASTEUR_ROLE = { id: 'role-pasteur', code: 'PASTEUR', label: 'Pasteur' };
const ADMIN_ROLE = { id: 'role-admin', code: 'ADMINISTRATEUR', label: 'Administrateur' };
const VISITEUR_ROLE = { id: 'role-visiteur', code: 'VISITEUR', label: 'Visiteur' };

function buildDeps(overrides: Partial<Record<string, unknown>> = {}) {
  const auditLogService = { record: vi.fn().mockResolvedValue(undefined) };
  const supabase = overrides.supabase ?? createSupabaseServiceMock({});
  const service = new RolesService(supabase as never, auditLogService as never);
  return { service, auditLogService, supabase };
}

describe('RolesService', () => {
  describe('assign', () => {
    it('refuses to assign a role above the max assignable rank (PASTEUR)', async () => {
      const { service } = buildDeps();

      await expect(
        service.assign({ userId: 'user-1', roleCode: 'ADMINISTRATEUR' } as never, 'actor-1'),
      ).rejects.toThrow('Roles above PASTEUR cannot be assigned via this endpoint');
    });

    it('allows assigning exactly the max assignable role (PASTEUR)', async () => {
      const supabase = createSupabaseServiceMock({
        roles: createQueryChain({ data: PASTEUR_ROLE, error: null }),
        role_assignments: createQueryChain({ data: null, error: null }),
      });
      const { service, auditLogService } = buildDeps({ supabase });

      await service.assign({ userId: 'user-1', roleCode: 'PASTEUR' } as never, 'actor-1');

      expect(auditLogService.record).toHaveBeenCalledWith(
        'actor-1',
        'ROLE_ASSIGNED',
        'role_assignment',
        'user-1',
        undefined,
        { roleCode: 'PASTEUR', communityId: null },
      );
    });

    it('does not throw on a duplicate assignment (unique violation is swallowed)', async () => {
      const supabase = createSupabaseServiceMock({
        roles: createQueryChain({ data: PASTEUR_ROLE, error: null }),
        role_assignments: createQueryChain({ data: null, error: { message: 'duplicate key', code: '23505' } }),
      });
      const { service } = buildDeps({ supabase });

      await expect(
        service.assign({ userId: 'user-1', roleCode: 'PASTEUR' } as never, 'actor-1'),
      ).resolves.toBeUndefined();
    });

    it('surfaces a non-duplicate database error', async () => {
      const supabase = createSupabaseServiceMock({
        roles: createQueryChain({ data: PASTEUR_ROLE, error: null }),
        role_assignments: createQueryChain({ data: null, error: { message: 'connection lost', code: '08000' } }),
      });
      const { service } = buildDeps({ supabase });

      await expect(service.assign({ userId: 'user-1', roleCode: 'PASTEUR' } as never, 'actor-1')).rejects.toThrow(
        'connection lost',
      );
    });

    it('throws NotFoundException for an unknown role code', async () => {
      const supabase = createSupabaseServiceMock({
        roles: createQueryChain({ data: null, error: null }),
      });
      const { service } = buildDeps({ supabase });

      await expect(service.assign({ userId: 'user-1', roleCode: 'PASTEUR' } as never, 'actor-1')).rejects.toThrow(
        'Role PASTEUR not found',
      );
    });
  });

  describe('revoke', () => {
    it('scopes the delete to community_id IS NULL when no community is given (global role)', async () => {
      const chain = createQueryChain({ data: null, error: null });
      const supabase = createSupabaseServiceMock({
        roles: createQueryChain({ data: ADMIN_ROLE, error: null }),
        role_assignments: chain,
      });
      const { service } = buildDeps({ supabase });

      await service.revoke({ userId: 'user-1', roleCode: 'ADMINISTRATEUR' } as never, 'actor-1');

      expect(chain.delete).toHaveBeenCalled();
      expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1');
      expect(chain.eq).toHaveBeenCalledWith('role_id', 'role-admin');
      expect(chain.is).toHaveBeenCalledWith('community_id', null);
    });

    it('scopes the delete to a specific community when one is given', async () => {
      const chain = createQueryChain({ data: null, error: null });
      const supabase = createSupabaseServiceMock({
        roles: createQueryChain({ data: ADMIN_ROLE, error: null }),
        role_assignments: chain,
      });
      const { service } = buildDeps({ supabase });

      await service.revoke({ userId: 'user-1', roleCode: 'ADMINISTRATEUR', communityId: 'community-1' } as never, 'actor-1');

      expect(chain.eq).toHaveBeenCalledWith('community_id', 'community-1');
      expect(chain.is).not.toHaveBeenCalled();
    });

    it('allows revoking a role above PASTEUR (revoke has no rank ceiling)', async () => {
      const supabase = createSupabaseServiceMock({
        roles: createQueryChain({ data: { id: 'role-super', code: 'SUPER_ADMINISTRATEUR', label: 'Super Admin' }, error: null }),
        role_assignments: createQueryChain({ data: null, error: null }),
      });
      const { service } = buildDeps({ supabase });

      await expect(
        service.revoke({ userId: 'user-1', roleCode: 'SUPER_ADMINISTRATEUR' } as never, 'actor-1'),
      ).resolves.toBeUndefined();
    });
  });

  describe('assignSystemDefaultRole', () => {
    it('assigns VISITEUR globally (no community) and swallows duplicates', async () => {
      const chain = createQueryChain({ data: null, error: { message: 'duplicate key', code: '23505' } });
      const supabase = createSupabaseServiceMock({
        roles: createQueryChain({ data: VISITEUR_ROLE, error: null }),
        role_assignments: chain,
      });
      const { service } = buildDeps({ supabase });

      await service.assignSystemDefaultRole('user-1');

      expect(chain.insert).toHaveBeenCalledWith({ user_id: 'user-1', role_id: 'role-visiteur', community_id: null });
    });
  });

  describe('list', () => {
    it('returns roles ordered by creation date', async () => {
      const chain = createQueryChain({ data: [VISITEUR_ROLE, PASTEUR_ROLE], error: null });
      const supabase = createSupabaseServiceMock({ roles: chain });
      const { service } = buildDeps({ supabase });

      const result = await service.list();

      expect(result).toHaveLength(2);
      expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: true });
    });
  });
});
