import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../access/decorators/current-user.decorator';
import { RequirePermission } from '../access/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../access/jwt-auth.guard';
import { PermissionGuard } from '../access/permission.guard';
import type { AuthenticatedUser } from '../access/interfaces/authenticated-user.interface';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignStatusDto } from './dto/update-campaign-status.dto';
import { CampaignStatus } from './prayer-state-machines';
import { PrayerCampaignsService } from './prayer-campaigns.service';

@ApiTags('campaigns')
@Controller('campaigns')
export class PrayerCampaignsController {
  constructor(private readonly campaignsService: PrayerCampaignsService) {}

  @Get()
  list(@Query() query: PaginationQueryDto) {
    return this.campaignsService.list(query);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('campaign.manage')
  create(@CurrentUser() currentUser: AuthenticatedUser, @Body() dto: CreateCampaignDto) {
    return this.campaignsService.create(dto, currentUser.id);
  }

  @Patch(':id/status')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('campaign.manage')
  updateStatus(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCampaignStatusDto,
  ) {
    return this.campaignsService.updateStatus(id, dto.status as CampaignStatus, currentUser.id);
  }
}
