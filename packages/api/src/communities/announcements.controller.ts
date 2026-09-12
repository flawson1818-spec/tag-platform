import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../access/decorators/current-user.decorator';
import { JwtAuthGuard } from '../access/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../access/optional-jwt-auth.guard';
import { PermissionsService } from '../access/permissions.service';
import type { AuthenticatedUser } from '../access/interfaces/authenticated-user.interface';
import { AnnouncementsService } from './announcements.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { ListAnnouncementsQueryDto } from './dto/list-announcements.query.dto';

const COMMUNITY_MANAGE_PERMISSION = 'community.manage';
const PUBLISH_OFFICIAL_PERMISSION = 'content.publish_official';

@ApiTags('announcements')
@Controller('announcements')
export class AnnouncementsController {
  constructor(
    private readonly announcementsService: AnnouncementsService,
    private readonly permissionsService: PermissionsService,
  ) {}

  /**
   * docs/01_FUNCTIONAL_SPECIFICATION.md §1.2: a nation-wide announcement (no communityId) is a
   * Pasteur+ responsibility ("content.publish_official", global only — same "global-only"
   * pattern already used for the world prayer program). A community-scoped one only needs
   * `community.manage` at that community, already granted to Responsable d'équipe+ (which
   * includes Pasteur, so a Pasteur publishing "to a community" doesn't need a second check).
   */
  private async assertCanAnnounce(userId: string, communityId: string | null): Promise<void> {
    if (communityId === null) {
      const globalPermissions = await this.permissionsService.getUserPermissionCodes(userId);
      if (!globalPermissions.has(PUBLISH_OFFICIAL_PERMISSION)) {
        throw new ForbiddenException(`Missing permission: ${PUBLISH_OFFICIAL_PERMISSION}`);
      }
      return;
    }
    const permissions = await this.permissionsService.getUserPermissionCodes(userId, communityId);
    if (!permissions.has(COMMUNITY_MANAGE_PERMISSION)) {
      throw new ForbiddenException(`Missing permission: ${COMMUNITY_MANAGE_PERMISSION}`);
    }
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async create(@CurrentUser() currentUser: AuthenticatedUser, @Body() dto: CreateAnnouncementDto) {
    const communityId = dto.communityId ?? null;
    await this.assertCanAnnounce(currentUser.id, communityId);
    return this.announcementsService.create(communityId, currentUser.id, dto.content);
  }

  /** Public read: no communityId lists nation-wide broadcasts only; with one, also includes them. */
  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  list(@Query() query: ListAnnouncementsQueryDto) {
    return this.announcementsService.list(query.communityId ?? null, query);
  }

  @Patch(':id/pin')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async pin(@CurrentUser() currentUser: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    const announcement = await this.announcementsService.findById(id);
    await this.assertCanAnnounce(currentUser.id, announcement.community_id);
    return this.announcementsService.setPinned(id, true);
  }

  @Patch(':id/unpin')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async unpin(@CurrentUser() currentUser: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    const announcement = await this.announcementsService.findById(id);
    await this.assertCanAnnounce(currentUser.id, announcement.community_id);
    return this.announcementsService.setPinned(id, false);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() currentUser: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    const announcement = await this.announcementsService.findById(id);
    await this.assertCanAnnounce(currentUser.id, announcement.community_id);
    return this.announcementsService.remove(id);
  }
}
