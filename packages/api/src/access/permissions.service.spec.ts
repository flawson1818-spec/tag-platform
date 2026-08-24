import { PermissionsService } from './permissions.service';
import { createQueryChain, createSupabaseServiceMock } from '../testing/supabase-query-mock';

describe('PermissionsService', () => {
  describe('getUserPermissionCodes', () => {
    it('collects permission codes from every matching role assignment', async () => {
      const supabase = createSupabaseServiceMock({
        role_assignments: createQueryChain({
          data: [
            {
              roles: {
                code: 'MODERATEUR',
                role_permissions: [
                  { permissions: { code: 'prayer_program.create' } },
                  { permissions: { code: 'prayer_program.moderate' } },
                ],
              },
            },
            {
              roles: {
                code: 'INTERCESSEUR',
                role_permissions: [{ permissions: { code: 'prayer_program.join' } }],
              },
            },
          ],
          error: null,
        }),
      });
      const service = new PermissionsService(supabase as never);

      const codes = await service.getUserPermissionCodes('user-1');

      expect(codes).toEqual(
        new Set(['prayer_program.create', 'prayer_program.moderate', 'prayer_program.join']),
      );
    });

    it('scopes the query to global assignments when no communityId is given', async () => {
      const chain = createQueryChain({ data: [], error: null });
      const supabase = createSupabaseServiceMock({ role_assignments: chain });
      const service = new PermissionsService(supabase as never);

      await service.getUserPermissionCodes('user-1');

      expect(chain.is).toHaveBeenCalledWith('community_id', null);
      expect(chain.or).not.toHaveBeenCalled();
    });

    it('includes both global and community-scoped assignments when a communityId is given', async () => {
      const chain = createQueryChain({ data: [], error: null });
      const supabase = createSupabaseServiceMock({ role_assignments: chain });
      const service = new PermissionsService(supabase as never);

      await service.getUserPermissionCodes('user-1', 'community-42');

      expect(chain.or).toHaveBeenCalledWith(
        'community_id.is.null,community_id.eq.community-42',
      );
      expect(chain.is).not.toHaveBeenCalled();
    });

    it('returns an empty set when the user has no role assignments', async () => {
      const supabase = createSupabaseServiceMock({
        role_assignments: createQueryChain({ data: [], error: null }),
      });
      const service = new PermissionsService(supabase as never);

      const codes = await service.getUserPermissionCodes('user-1');

      expect(codes.size).toBe(0);
    });

    it('tolerates a role assignment with a null roles relation', async () => {
      const supabase = createSupabaseServiceMock({
        role_assignments: createQueryChain({ data: [{ roles: null }], error: null }),
      });
      const service = new PermissionsService(supabase as never);

      const codes = await service.getUserPermissionCodes('user-1');

      expect(codes.size).toBe(0);
    });

    it('throws InternalServerErrorException when the query errors', async () => {
      const supabase = createSupabaseServiceMock({
        role_assignments: createQueryChain({ data: null, error: { message: 'db down' } }),
      });
      const service = new PermissionsService(supabase as never);

      await expect(service.getUserPermissionCodes('user-1')).rejects.toThrow('db down');
    });
  });

  describe('getUserRoleCodes', () => {
    it('collects role codes, skipping rows with a null roles relation', async () => {
      const supabase = createSupabaseServiceMock({
        role_assignments: createQueryChain({
          data: [{ roles: { code: 'MODERATEUR' } }, { roles: null }, { roles: { code: 'INTERCESSEUR' } }],
          error: null,
        }),
      });
      const service = new PermissionsService(supabase as never);

      const codes = await service.getUserRoleCodes('user-1');

      expect(codes).toEqual(new Set(['MODERATEUR', 'INTERCESSEUR']));
    });

    it('throws InternalServerErrorException when the query errors', async () => {
      const supabase = createSupabaseServiceMock({
        role_assignments: createQueryChain({ data: null, error: { message: 'db down' } }),
      });
      const service = new PermissionsService(supabase as never);

      await expect(service.getUserRoleCodes('user-1')).rejects.toThrow('db down');
    });

    it('scopes to global assignments only when globalOnly is set', async () => {
      const chain = createQueryChain({ data: [], error: null });
      const supabase = createSupabaseServiceMock({ role_assignments: chain });
      const service = new PermissionsService(supabase as never);

      await service.getUserRoleCodes('user-1', { globalOnly: true });

      expect(chain.is).toHaveBeenCalledWith('community_id', null);
    });

    it('does not scope by community when globalOnly is not set', async () => {
      const chain = createQueryChain({ data: [], error: null });
      const supabase = createSupabaseServiceMock({ role_assignments: chain });
      const service = new PermissionsService(supabase as never);

      await service.getUserRoleCodes('user-1');

      expect(chain.is).not.toHaveBeenCalled();
    });
  });
});
