import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

interface RoleAssignmentRow {
  roles: { code: string; role_permissions: { permissions: { code: string } }[] } | null;
}

/**
 * "Read-type" per docs/06_RBAC_SPECIFICATION.md section 6 — determined by naming convention
 * (permissions.code has no dedicated column for this) rather than a schema change: every
 * currently-seeded read permission ends in a `view`/`read`/`list` token (room.view,
 * audit_log.view, analytics.view_dashboard), while every write/manage one doesn't.
 */
const READ_PERMISSION_PATTERN = /(^|[._])(view|read|list)([._]|$)/;

function isReadPermission(code: string): boolean {
  return READ_PERMISSION_PATTERN.test(code);
}

/** Hard cap on hierarchy depth — community trees are documented as shallow (cellule → église →
 *  pays); this only guards against a parent_id cycle bug, never a real-world tree. */
const MAX_HIERARCHY_DEPTH = 10;

@Injectable()
export class PermissionsService {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Global assignments (community_id IS NULL) always contribute their permissions. A
   * community-scoped assignment contributes within that exact community; additionally,
   * docs/06_RBAC_SPECIFICATION.md section 6: "remonte la hiérarchie de la communauté (parent_id)
   * ... si aucune attribution directe n'existe et que la permission est de type lecture" — a
   * Responsable of a cellule can read (never write) information belonging to its parent église,
   * pays, etc., without needing a separate assignment at every ancestor level.
   */
  async getUserPermissionCodes(userId: string, communityId?: string): Promise<Set<string>> {
    const codes = await this.fetchDirectPermissionCodes(userId, communityId);
    if (communityId) await this.mergeInheritedReadPermissions(userId, communityId, codes);
    return codes;
  }

  private async fetchDirectPermissionCodes(userId: string, communityId?: string): Promise<Set<string>> {
    let query = this.supabase.client
      .from('role_assignments')
      .select('roles(code, role_permissions(permissions(code)))')
      .eq('user_id', userId);
    query = communityId
      ? query.or(`community_id.is.null,community_id.eq.${communityId}`)
      : query.is('community_id', null);

    const { data, error } = await query;
    if (error) throw new InternalServerErrorException(error.message);

    const codes = new Set<string>();
    for (const row of (data ?? []) as unknown as RoleAssignmentRow[]) {
      for (const rp of row.roles?.role_permissions ?? []) {
        codes.add(rp.permissions.code);
      }
    }
    return codes;
  }

  private async mergeInheritedReadPermissions(userId: string, communityId: string, codes: Set<string>): Promise<void> {
    let currentId = communityId;
    const visited = new Set<string>([communityId]);

    for (let depth = 0; depth < MAX_HIERARCHY_DEPTH; depth += 1) {
      const parentId = await this.getParentCommunityId(currentId);
      if (!parentId || visited.has(parentId)) return;
      visited.add(parentId);

      const ancestorCodes = await this.fetchDirectPermissionCodes(userId, parentId);
      for (const code of ancestorCodes) {
        if (isReadPermission(code)) codes.add(code);
      }
      currentId = parentId;
    }
  }

  private async getParentCommunityId(communityId: string): Promise<string | null> {
    const { data, error } = await this.supabase.client
      .from('communities')
      .select('parent_id')
      .eq('id', communityId)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    return (data as { parent_id: string | null } | null)?.parent_id ?? null;
  }

  /** Every distinct user holding at least one of the given role codes, anywhere (global or scoped). */
  async listUserIdsWithAnyRole(roleCodes: string[]): Promise<string[]> {
    const { data, error } = await this.supabase.client
      .from('role_assignments')
      .select('user_id, roles!inner(code)')
      .in('roles.code', roleCodes);
    if (error) throw new InternalServerErrorException(error.message);
    const userIds = new Set((data as unknown as { user_id: string }[]).map((r) => r.user_id));
    return Array.from(userIds);
  }

  async getUserRoleCodes(userId: string, options?: { globalOnly?: boolean }): Promise<Set<string>> {
    let query = this.supabase.client.from('role_assignments').select('roles(code)').eq('user_id', userId);
    if (options?.globalOnly) query = query.is('community_id', null);
    const { data, error } = await query;
    if (error) throw new InternalServerErrorException(error.message);

    const codes = new Set<string>();
    for (const row of (data ?? []) as unknown as { roles: { code: string } | null }[]) {
      if (row.roles) codes.add(row.roles.code);
    }
    return codes;
  }
}
