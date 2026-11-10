import { Body, Controller, DefaultValuePipe, Delete, Get, Param, ParseIntPipe, Patch, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../access/decorators/current-user.decorator';
import { RequirePermission } from '../access/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../access/jwt-auth.guard';
import { PermissionGuard } from '../access/permission.guard';
import { PermissionsService } from '../access/permissions.service';
import type { AuthenticatedUser } from '../access/interfaces/authenticated-user.interface';
import { SetFlambeauDto, SetIntentionDto, UpdateFlambeauDto } from './dto/watch.dto';
import { localDay, WatchService } from './watch.service';

/** Preparing the days of the watch belongs to those who write the prayer programme. */
const PLAN_PERMISSION = 'prayer_program.create';

@ApiTags('watch')
@Controller('watch')
export class WatchController {
  constructor(
    private readonly watchService: WatchService,
    private readonly permissionsService: PermissionsService,
  ) {}

  /** Public: today's world intention and Flambeau, for every home page. */
  @Get('today')
  today() {
    return this.watchService.today();
  }

  @Get('plan')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission(PLAN_PERMISSION)
  plan(@Query('from') from: string | undefined, @Query('days', new DefaultValuePipe(14), ParseIntPipe) days: number) {
    return this.watchService.plan(from || localDay(), days);
  }

  @Put('intentions/:day')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission(PLAN_PERMISSION)
  setIntention(@CurrentUser() user: AuthenticatedUser, @Param('day') day: string, @Body() dto: SetIntentionDto) {
    return this.watchService.setIntention(day, dto, user.id);
  }

  @Delete('intentions/:day')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission(PLAN_PERMISSION)
  removeIntention(@Param('day') day: string) {
    return this.watchService.removeIntention(day);
  }

  @Put('flambeau/:day')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission(PLAN_PERMISSION)
  setFlambeau(@CurrentUser() user: AuthenticatedUser, @Param('day') day: string, @Body() dto: SetFlambeauDto) {
    return this.watchService.setFlambeau(day, dto, user.id);
  }

  @Delete('flambeau/:day')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission(PLAN_PERMISSION)
  removeFlambeau(@Param('day') day: string) {
    return this.watchService.removeFlambeau(day);
  }

  /** The guardian ticks the list or writes the encouragement (the administration may too). */
  @Patch('flambeau/:day')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async updateFlambeau(@CurrentUser() user: AuthenticatedUser, @Param('day') day: string, @Body() dto: UpdateFlambeauDto) {
    const canManage = (await this.permissionsService.getUserPermissionCodes(user.id)).has(PLAN_PERMISSION);
    return this.watchService.updateFlambeau(day, dto, user.id, canManage);
  }
}
