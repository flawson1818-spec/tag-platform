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
      const supabase = createSupabaseServiceMock({
        role_assignments: chain,
        communities: createQueryChain({ data: { parent_id: null }, error: null }),
      });
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

    it('does not query communities at all when no communityId is given', async () => {
      const roleAssignments = createQueryChain({ data: [], error: null });
      const supabase = createSupabaseServiceMock({ role_assignments: roleAssignments });
      const service = new PermissionsService(supabase as never);

      await expect(service.getUserPermissionCodes('user-1')).resolves.toEqual(new Set());
    });

    it('walks up the community hierarchy, merging only read-type permissions from ancestors', async () => {
      const roleAssignmentsByLevel = [
        createQueryChain({
          data: [{ roles: { code: 'RESPONSABLE_EQUIPE', role_permissions: [{ permissions: { code: 'community.manage' } }] } }],
          error: null,
        }), // direct: cellule (community-1)
        createQueryChain({
          data: [
            {
              roles: {
                code: 'RESPONSABLE_EQUIPE',
                role_permissions: [
                  { permissions: { code: 'room.view' } },
                  { permissions: { code: 'event.manage' } },
                ],
              },
            },
          ],
          error: null,
        }), // ancestor: église (church-1)
        createQueryChain({
          data: [{ roles: { code: 'PASTEUR', role_permissions: [{ permissions: { code: 'audit_log.view' } }] } }],
          error: null,
        }), // ancestor: pays (country-1)
      ];
      const communitiesByLevel = [
        createQueryChain({ data: { parent_id: 'church-1' }, error: null }), // parent of community-1
        createQueryChain({ data: { parent_id: 'country-1' }, error: null }), // parent of church-1
        createQueryChain({ data: { parent_id: null }, error: null }), // parent of country-1 (root)
      ];
      const supabase = createSupabaseServiceMock({
        role_assignments: roleAssignmentsByLevel,
        communities: communitiesByLevel,
      });
      const service = new PermissionsService(supabase as never);

      const codes = await service.getUserPermissionCodes('user-1', 'community-1');

      expect(codes).toEqual(new Set(['community.manage', 'room.view', 'audit_log.view']));
      expect(codes.has('event.manage')).toBe(false); // write-type — never inherited
    });

    it('stops immediately when the community has no parent', async () => {
      const roleAssignments = createQueryChain({ data: [], error: null });
      const communities = createQueryChain({ data: { parent_id: null }, error: null });
      const supabase = createSupabaseServiceMock({ role_assignments: roleAssignments, communities });
      const service = new PermissionsService(supabase as never);

      await service.getUserPermissionCodes('user-1', 'community-1');

      expect(communities.eq).toHaveBeenCalledTimes(1);
    });

    it('never loops forever if parent_id forms a cycle', async () => {
      const roleAssignments = createQueryChain({ data: [], error: null });
      const communitiesByLevel = [
        createQueryChain({ data: { parent_id: 'community-2' }, error: null }),
        createQueryChain({ data: { parent_id: 'community-1' }, error: null }), // cycles back
      ];
      const supabase = createSupabaseServiceMock({ role_assignments: roleAssignments, communities: communitiesByLevel });
      const service = new PermissionsService(supabase as never);

      await expect(service.getUserPermissionCodes('user-1', 'community-1')).resolves.toBeInstanceOf(Set);
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

  describe('listUserIdsWithAnyRole', () => {
    it('deduplicates a user holding more than one matching role', async () => {
      const supabase = createSupabaseServiceMock({
        role_assignments: createQueryChain({
          data: [
            { user_id: 'user-1', roles: { code: 'MODERATEUR' } },
            { user_id: 'user-1', roles: { code: 'PASTEUR' } },
            { user_id: 'user-2', roles: { code: 'MODERATEUR' } },
          ],
          error: null,
        }),
      });
      const service = new PermissionsService(supabase as never);

      const result = await service.listUserIdsWithAnyRole(['MODERATEUR', 'PASTEUR']);

      expect(result.sort()).toEqual(['user-1', 'user-2']);
    });

    it('filters role_assignments by the given role codes', async () => {
      const chain = createQueryChain({ data: [], error: null });
      const supabase = createSupabaseServiceMock({ role_assignments: chain });
      const service = new PermissionsService(supabase as never);

      await service.listUserIdsWithAnyRole(['ADMINISTRATEUR']);

      expect(chain.in).toHaveBeenCalledWith('roles.code', ['ADMINISTRATEUR']);
    });

    it('throws InternalServerErrorException when the query errors', async () => {
      const supabase = createSupabaseServiceMock({
        role_assignments: createQueryChain({ data: null, error: { message: 'db down' } }),
      });
      const service = new PermissionsService(supabase as never);

      await expect(service.listUserIdsWithAnyRole(['MODERATEUR'])).rejects.toThrow('db down');
    });
  });
});
