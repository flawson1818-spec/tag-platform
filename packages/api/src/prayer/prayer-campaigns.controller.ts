import { Body, Controller, ForbiddenException, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../access/decorators/current-user.decorator';
import { JwtAuthGuard } from '../access/jwt-auth.guard';
import { PermissionsService } from '../access/permissions.service';
import type { AuthenticatedUser } from '../access/interfaces/authenticated-user.interface';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignStatusDto } from './dto/update-campaign-status.dto';
import { CampaignStatus } from './prayer-state-machines';
import { PrayerCampaignsService } from './prayer-campaigns.service';

const CAMPAIGN_PERMISSION = 'campaign.manage';

@ApiTags('campaigns')
@Controller('campaigns')
export class PrayerCampaignsController {
  constructor(
    private readonly campaignsService: PrayerCampaignsService,
    private readonly permissionsService: PermissionsService,
  ) {}

  /** See docs/06_RBAC_SPECIFICATION.md section 1 — a community-scoped role assignment must count within its own community. */
  private async assertCanManage(userId: string, communityId: string | null): Promise<void> {
    const permissions = await this.permissionsService.getUserPermissionCodes(userId, communityId ?? undefined);
    if (!permissions.has(CAMPAIGN_PERMISSION)) {
      throw new ForbiddenException(`Missing permission: ${CAMPAIGN_PERMISSION}`);
    }
  }

  @Get()
  list(@Query() query: PaginationQueryDto) {
    return this.campaignsService.list(query);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async create(@CurrentUser() currentUser: AuthenticatedUser, @Body() dto: CreateCampaignDto) {
    await this.assertCanManage(currentUser.id, dto.communityId ?? null);
    return this.campaignsService.create(dto, currentUser.id);
  }

  @Patch(':id/status')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async updateStatus(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCampaignStatusDto,
  ) {
    const campaign = await this.campaignsService.findById(id);
    await this.assertCanManage(currentUser.id, campaign.community_id);
    return this.campaignsService.updateStatus(id, dto.status as CampaignStatus, currentUser.id);
  }
}
