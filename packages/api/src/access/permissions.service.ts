import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

interface RoleAssignmentRow {
  roles: { code: string; role_permissions: { permissions: { code: string } }[] } | null;
}

@Injectable()
export class PermissionsService {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Global assignments (community_id IS NULL) always contribute their permissions.
   * A community-scoped assignment only contributes within that exact community —
   * hierarchy walk-up for read permissions (docs/06_RBAC_SPECIFICATION.md section 6)
   * is deferred until a permission is flagged as read-type in the schema.
   */
  async getUserPermissionCodes(userId: string, communityId?: string): Promise<Set<string>> {
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

  async getUserRoleCodes(userId: string): Promise<Set<string>> {
    const { data, error } = await this.supabase.client
      .from('role_assignments')
      .select('roles(code)')
      .eq('user_id', userId);
    if (error) throw new InternalServerErrorException(error.message);

    const codes = new Set<string>();
    for (const row of (data ?? []) as unknown as { roles: { code: string } | null }[]) {
      if (row.roles) codes.add(row.roles.code);
    }
    return codes;
  }
}
