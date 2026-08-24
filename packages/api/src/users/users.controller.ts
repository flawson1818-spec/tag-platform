import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../access/decorators/current-user.decorator';
import { RequirePermission } from '../access/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../access/jwt-auth.guard';
import { PermissionGuard } from '../access/permission.guard';
import { PermissionsService } from '../access/permissions.service';
import type { AuthenticatedUser } from '../access/interfaces/authenticated-user.interface';
import { ListUsersQueryDto } from './dto/list-users.query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { toUserResponse } from './user-response.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly permissionsService: PermissionsService,
  ) {}

  @Get('me')
  async getMe(@CurrentUser() currentUser: AuthenticatedUser) {
    return toUserResponse(await this.usersService.findById(currentUser.id));
  }

  @Patch('me')
  async updateMe(@CurrentUser() currentUser: AuthenticatedUser, @Body() dto: UpdateUserDto) {
    return toUserResponse(await this.usersService.updateProfile(currentUser.id, dto));
  }

  /** Self-service GDPR export — must be registered before ':id' so 'export' never matches as a UUID param. */
  @Get('me/export')
  exportMe(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.usersService.exportMyData(currentUser.id);
  }

  /** Self-service GDPR erasure — must be registered before ':id' so 'me' never matches as a UUID param. */
  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteMe(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.usersService.deleteMyAccount(currentUser.id);
  }

  @Delete('me/ai-history')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteMyAiHistory(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.usersService.deleteMyAiHistory(currentUser.id);
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('user.manage')
  list(@Query() query: ListUsersQueryDto) {
    return this.usersService.list(query);
  }

  @Get(':id')
  async findOne(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    if (currentUser.id !== id) {
      const permissions = await this.permissionsService.getUserPermissionCodes(currentUser.id);
      if (!permissions.has('user.manage')) {
        throw new ForbiddenException('Permission denied');
      }
    }
    return toUserResponse(await this.usersService.findById(id));
  }

  @Patch(':id/status')
  @UseGuards(PermissionGuard)
  @RequirePermission('user.manage')
  async updateStatus(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return toUserResponse(await this.usersService.updateStatus(id, dto.status, currentUser.id));
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('user.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() currentUser: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.softDelete(id, currentUser.id);
  }
}
