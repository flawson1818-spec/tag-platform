import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
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
  ) {}

  async list(): Promise<Role[]> {
    const { data, error } = await this.supabase.client
      .from('roles')
      .select('id, code, label, created_at, updated_at')
      .order('created_at', { ascending: true });
    if (error) throw new InternalServerErrorException(error.message);
    return data as unknown as Role[];
  }

  async assign(dto: AssignRoleDto, actorId: string): Promise<void> {
    if (roleRank(dto.roleCode) > roleRank(MAX_ASSIGNABLE_ROLE)) {
      throw new ForbiddenException(`Roles above ${MAX_ASSIGNABLE_ROLE} cannot be assigned via this endpoint`);
    }
    const role = await this.getRoleByCode(dto.roleCode);

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
