import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../access/decorators/current-user.decorator';
import { RequirePermission } from '../access/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../access/jwt-auth.guard';
import { PermissionGuard } from '../access/permission.guard';
import type { AuthenticatedUser } from '../access/interfaces/authenticated-user.interface';
import { AnalyticsService } from './analytics.service';
import { RequestExportDto } from './dto/request-export.dto';

@ApiTags('analytics')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  /**
   * Public: only country/timezone-level aggregates (see 08_NON_FUNCTIONAL_REQUIREMENTS §privacy),
   * needed unauthenticated by the Accueil screen (07_UX_UI_SPECIFICATION §1 — mini world map,
   * global counter, no account required to see the room is live).
   */
  @Get('world-map')
  worldMap() {
    return this.analyticsService.getWorldMap();
  }

  @Get('dashboard')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('analytics.view_dashboard')
  dashboard() {
    return this.analyticsService.getDashboard();
  }

  @Get('export')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('analytics.export')
  requestExport(@CurrentUser() currentUser: AuthenticatedUser, @Query() query: RequestExportDto) {
    return this.analyticsService.requestExport(query.scope, currentUser.id);
  }
}
