import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../access/decorators/current-user.decorator';
import { JwtAuthGuard } from '../access/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../access/optional-jwt-auth.guard';
import { PermissionGuard } from '../access/permission.guard';
import { PermissionsService } from '../access/permissions.service';
import { RequirePermission } from '../access/decorators/require-permission.decorator';
import type { AuthenticatedUser } from '../access/interfaces/authenticated-user.interface';
import { CreatePrayerRequestDto } from './dto/create-prayer-request.dto';
import { ListPrayerRequestsQueryDto } from './dto/list-prayer-requests.query.dto';
import { PromotePrayerRequestDto } from './dto/promote-prayer-request.dto';
import { UpdatePrayerRequestStatusDto } from './dto/update-prayer-request-status.dto';
import { PrayerRequestStatus } from './prayer-request.entity';
import { PrayerRequestsService } from './prayer-requests.service';

const MODERATE_PERMISSION = 'prayer_request.manage_status';

@ApiTags('prayer-requests')
@Controller('prayer-requests')
export class PrayerRequestsController {
  constructor(
    private readonly requestsService: PrayerRequestsService,
    private readonly permissionsService: PermissionsService,
  ) {}

  @Post()
  @UseGuards(OptionalJwtAuthGuard)
  async create(
    @CurrentUser() currentUser: AuthenticatedUser | undefined,
    @Body() dto: CreatePrayerRequestDto,
  ) {
    const canCreatePublic = currentUser
      ? (await this.permissionsService.getUserPermissionCodes(currentUser.id)).has('prayer_request.create_public')
      : false;
    return this.requestsService.create(dto, currentUser?.id ?? null, canCreatePublic);
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async list(@CurrentUser() currentUser: AuthenticatedUser, @Query() query: ListPrayerRequestsQueryDto) {
    const canSeePrivate = (await this.permissionsService.getUserPermissionCodes(currentUser.id)).has(
      MODERATE_PERMISSION,
    );
    return this.requestsService.list(query, canSeePrivate, currentUser.id);
  }

  @Get('flagged')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission(MODERATE_PERMISSION)
  listFlagged() {
    return this.requestsService.listFlagged();
  }

  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async findOne(@CurrentUser() currentUser: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    const canSeePrivate = (await this.permissionsService.getUserPermissionCodes(currentUser.id)).has(
      MODERATE_PERMISSION,
    );
    return this.requestsService.findById(id, canSeePrivate);
  }

  @Get(':id/media')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async media(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('kind') kind: 'photo' | 'attachment' = 'photo',
  ) {
    const canSeePrivate = (await this.permissionsService.getUserPermissionCodes(currentUser.id)).has(
      MODERATE_PERMISSION,
    );
    const url = await this.requestsService.getMediaUrl(id, kind, canSeePrivate);
    return { url };
  }

  @Patch(':id/status')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async updateStatus(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePrayerRequestStatusDto,
  ) {
    const canManageStatus = (await this.permissionsService.getUserPermissionCodes(currentUser.id)).has(
      MODERATE_PERMISSION,
    );
    return this.requestsService.updateStatus(
      id,
      dto.status as PrayerRequestStatus,
      currentUser.id,
      canManageStatus,
    );
  }

  @Post(':id/promote')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('prayer_request.promote')
  @HttpCode(HttpStatus.OK)
  promote(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PromotePrayerRequestDto,
  ) {
    return this.requestsService.promote(id, dto, currentUser.id);
  }
}
