import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../access/decorators/current-user.decorator';
import { RequirePermission } from '../access/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../access/jwt-auth.guard';
import { PermissionGuard } from '../access/permission.guard';
import type { AuthenticatedUser } from '../access/interfaces/authenticated-user.interface';
import { AssignRoleDto } from './dto/assign-role.dto';
import { RevokeRoleDto } from './dto/revoke-role.dto';
import { RolesService } from './roles.service';

@ApiTags('roles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  list() {
    return this.rolesService.list();
  }

  @Post('assign')
  @UseGuards(PermissionGuard)
  @RequirePermission('role.assign')
  @HttpCode(HttpStatus.NO_CONTENT)
  assign(@CurrentUser() currentUser: AuthenticatedUser, @Body() dto: AssignRoleDto) {
    return this.rolesService.assign(dto, currentUser.id);
  }

  @Post('revoke')
  @UseGuards(PermissionGuard)
  @RequirePermission('role.assign')
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(@CurrentUser() currentUser: AuthenticatedUser, @Body() dto: RevokeRoleDto) {
    return this.rolesService.revoke(dto, currentUser.id);
  }
}
