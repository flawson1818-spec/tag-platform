import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { ROLE_HIERARCHY } from '../role-hierarchy';

export class AssignRoleDto {
  @IsUUID()
  userId!: string;

  @IsIn(ROLE_HIERARCHY)
  roleCode!: string;

  @IsOptional()
  @IsUUID()
  communityId?: string;
}
