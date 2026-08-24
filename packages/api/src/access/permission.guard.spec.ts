import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionGuard } from './permission.guard';

function buildContext(user: { id: string } | undefined): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function buildDeps(requiredPermission: string | undefined) {
  const reflector = { getAllAndOverride: vi.fn().mockReturnValue(requiredPermission) } as unknown as Reflector;
  const permissionsService = { getUserPermissionCodes: vi.fn() };
  const guard = new PermissionGuard(reflector, permissionsService as never);
  return { guard, reflector, permissionsService };
}

describe('PermissionGuard', () => {
  it('allows the request when the route requires no specific permission', async () => {
    const { guard, permissionsService } = buildDeps(undefined);

    const allowed = await guard.canActivate(buildContext({ id: 'user-1' }));

    expect(allowed).toBe(true);
    expect(permissionsService.getUserPermissionCodes).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated request (no req.user) even for a permission-gated route', async () => {
    const { guard } = buildDeps('community.manage');

    await expect(guard.canActivate(buildContext(undefined))).rejects.toThrow('Permission denied');
  });

  it('allows the request when the user holds the required permission', async () => {
    const { guard, permissionsService } = buildDeps('community.manage');
    permissionsService.getUserPermissionCodes.mockResolvedValue(new Set(['community.manage', 'post.create']));

    const allowed = await guard.canActivate(buildContext({ id: 'user-1' }));

    expect(allowed).toBe(true);
    expect(permissionsService.getUserPermissionCodes).toHaveBeenCalledWith('user-1');
  });

  it('rejects with the specific missing permission code when the user lacks it', async () => {
    const { guard, permissionsService } = buildDeps('community.manage');
    permissionsService.getUserPermissionCodes.mockResolvedValue(new Set(['post.create']));

    await expect(guard.canActivate(buildContext({ id: 'user-1' }))).rejects.toThrow(
      'Missing permission: community.manage',
    );
  });
});
