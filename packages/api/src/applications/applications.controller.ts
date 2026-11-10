import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../access/decorators/current-user.decorator';
import { RequirePermission } from '../access/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../access/jwt-auth.guard';
import { PermissionGuard } from '../access/permission.guard';
import type { AuthenticatedUser } from '../access/interfaces/authenticated-user.interface';
import { CreateApplicationDto, ReviewApplicationDto } from './dto/applications.dto';
import { ApplicationsService } from './applications.service';

@ApiTags('applications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post()
  apply(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateApplicationDto) {
    return this.applicationsService.apply(user.id, dto);
  }

  @Get('mine')
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.applicationsService.mine(user.id);
  }

  /** The administration's inbox. Approving needs role.assign too (checked by RolesService). */
  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('role.assign')
  list(@Query('status') status?: string, @Query('kind') kind?: string) {
    const s = ['PENDING', 'APPROVED', 'REJECTED'].includes(status ?? '') ? status : undefined;
    const k = ['INTERCESSOR', 'COMMUNITY'].includes(kind ?? '') ? kind : undefined;
    return this.applicationsService.list(s, k);
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('role.assign')
  review(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewApplicationDto) {
    return this.applicationsService.review(id, dto, user.id);
  }
}
