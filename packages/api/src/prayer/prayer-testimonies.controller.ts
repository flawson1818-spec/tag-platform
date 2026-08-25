import { Body, Controller, Get, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../access/decorators/current-user.decorator';
import { RequirePermission } from '../access/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../access/jwt-auth.guard';
import { PermissionGuard } from '../access/permission.guard';
import { PermissionsService } from '../access/permissions.service';
import type { AuthenticatedUser } from '../access/interfaces/authenticated-user.interface';
import { CreateTestimonyDto } from './dto/create-testimony.dto';
import { ListTestimoniesQueryDto } from './dto/list-testimonies.query.dto';
import { RejectTestimonyDto } from './dto/reject-testimony.dto';
import { UpdateTestimonyDto } from './dto/update-testimony.dto';
import { PrayerTestimoniesService } from './prayer-testimonies.service';

const MODERATE_PERMISSION = 'testimony.approve';

@ApiTags('testimonies')
@ApiBearerAuth()
@Controller('testimonies')
export class PrayerTestimoniesController {
  constructor(
    private readonly testimoniesService: PrayerTestimoniesService,
    private readonly permissionsService: PermissionsService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('testimony.create')
  create(@CurrentUser() currentUser: AuthenticatedUser, @Body() dto: CreateTestimonyDto) {
    return this.testimoniesService.create(dto, currentUser.id);
  }

  @Get('flagged')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission(MODERATE_PERMISSION)
  listFlagged() {
    return this.testimoniesService.listFlagged();
  }

  /** Public: see PrayerTestimoniesService.listRecentPublished. Declared before `:id/media` — not
   * strictly required for route matching (different second segment) but keeps static routes first. */
  @Get('public/recent')
  listRecentPublic(@Query('limit', new ParseIntPipe({ optional: true })) limit?: number) {
    return this.testimoniesService.listRecentPublished(limit ?? 6);
  }

  @Get(':id/media')
  @UseGuards(JwtAuthGuard)
  async media(@CurrentUser() currentUser: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    const canModerate = (await this.permissionsService.getUserPermissionCodes(currentUser.id)).has(
      MODERATE_PERMISSION,
    );
    const url = await this.testimoniesService.getMediaUrl(id, currentUser.id, canModerate);
    return { url };
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async list(@CurrentUser() currentUser: AuthenticatedUser, @Query() query: ListTestimoniesQueryDto) {
    const canModerate = (await this.permissionsService.getUserPermissionCodes(currentUser.id)).has(
      MODERATE_PERMISSION,
    );
    return this.testimoniesService.list(query, canModerate, currentUser.id);
  }

  /** Author-only, and only while still DRAFT — see PrayerTestimoniesService.update(). */
  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTestimonyDto,
  ) {
    return this.testimoniesService.update(id, dto, currentUser.id);
  }

  @Patch(':id/approve')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission(MODERATE_PERMISSION)
  approve(@CurrentUser() currentUser: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.testimoniesService.approve(id, currentUser.id);
  }

  @Patch(':id/reject')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission(MODERATE_PERMISSION)
  reject(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectTestimonyDto,
  ) {
    return this.testimoniesService.reject(id, currentUser.id, dto.reason);
  }
}
