import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PermissionsService } from '../access/permissions.service';
import { AuditLogService } from '../administration/audit-log.service';
import { SupabaseService } from '../supabase/supabase.service';
import { AssignRoleDto } from './dto/assign-role.dto';
import { RevokeRoleDto } from './dto/revoke-role.dto';
import { DEFAULT_REGISTRATION_ROLE, MAX_ASSIGNABLE_ROLE, roleRank } from './role-hierarchy';
import { Role } from './role.entity';

@Injectable()
export class RolesService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly auditLogService: AuditLogService,
    private readonly permissionsService: PermissionsService,
  ) {}

  /**
   * The highest role an actor may give or take away (docs/06_RBAC_SPECIFICATION.md §3): up to
   * Pasteur for anyone holding role.assign, up to Administrateur for a Super Administrateur.
   * Super Administrateur itself is never handed out or removed through the site.
   */
  private async maxManageableRank(actorId: string): Promise<number> {
    const actorRoles = await this.permissionsService.getUserRoleCodes(actorId, { globalOnly: true });
    return actorRoles.has('SUPER_ADMINISTRATEUR') ? roleRank('ADMINISTRATEUR') : roleRank(MAX_ASSIGNABLE_ROLE);
  }

  private async assertCanManage(roleCode: string, actorId: string, targetUserId: string): Promise<void> {
    if (roleRank(roleCode) < 0) throw new NotFoundException(`Role ${roleCode} not found`);
    if (targetUserId === actorId && roleRank(roleCode) >= roleRank('ADMINISTRATEUR')) {
      throw new ForbiddenException('Tu ne peux pas modifier ton propre rôle d\u2019administration.');
    }
    if (roleRank(roleCode) > (await this.maxManageableRank(actorId))) {
      throw new ForbiddenException('Ce rôle est au-dessus de ce que tu peux attribuer ou retirer.');
    }
  }

  async list(): Promise<Role[]> {
    const { data, error } = await this.supabase.client
      .from('roles')
      .select('id, code, label, created_at, updated_at')
      .order('created_at', { ascending: true });
    if (error) throw new InternalServerErrorException(error.message);
    return data as unknown as Role[];
  }

  async assign(dto: AssignRoleDto, actorId: string): Promise<void> {
    await this.assertCanManage(dto.roleCode, actorId, dto.userId);
    const role = await this.getRoleByCode(dto.roleCode);

    // The unique constraint can't catch duplicates when community_id is null (NULLs differ).
    let existing = this.supabase.client
      .from('role_assignments')
      .select('id')
      .eq('user_id', dto.userId)
      .eq('role_id', role.id);
    existing = dto.communityId ? existing.eq('community_id', dto.communityId) : existing.is('community_id', null);
    const { data: found, error: findError } = await existing.limit(1);
    if (findError) throw new InternalServerErrorException(findError.message);
    if ((found ?? []).length > 0) return;

    const { error } = await this.supabase.client.from('role_assignments').insert({
      user_id: dto.userId,
      role_id: role.id,
      community_id: dto.communityId ?? null,
    });
    if (error && error.code !== '23505') throw new InternalServerErrorException(error.message);

    await this.auditLogService.record(actorId, 'ROLE_ASSIGNED', 'role_assignment', dto.userId, undefined, {
      roleCode: dto.roleCode,
      communityId: dto.communityId ?? null,
    });
  }

  async revoke(dto: RevokeRoleDto, actorId: string): Promise<void> {
    await this.assertCanManage(dto.roleCode, actorId, dto.userId);
    const role = await this.getRoleByCode(dto.roleCode);

    let request = this.supabase.client
      .from('role_assignments')
      .delete()
      .eq('user_id', dto.userId)
      .eq('role_id', role.id);
    request = dto.communityId
      ? request.eq('community_id', dto.communityId)
      : request.is('community_id', null);

    const { error } = await request;
    if (error) throw new InternalServerErrorException(error.message);

    await this.auditLogService.record(actorId, 'ROLE_REVOKED', 'role_assignment', dto.userId, undefined, {
      roleCode: dto.roleCode,
      communityId: dto.communityId ?? null,
    });
  }

  async assignSystemDefaultRole(userId: string): Promise<void> {
    const role = await this.getRoleByCode(DEFAULT_REGISTRATION_ROLE);
    const { error } = await this.supabase.client
      .from('role_assignments')
      .insert({ user_id: userId, role_id: role.id, community_id: null });
    if (error && error.code !== '23505') throw new InternalServerErrorException(error.message);
  }

  private async getRoleByCode(code: string): Promise<Role> {
    const { data, error } = await this.supabase.client
      .from('roles')
      .select('id, code, label, created_at, updated_at')
      .eq('code', code)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException(`Role ${code} not found`);
    return data as unknown as Role;
  }
}
