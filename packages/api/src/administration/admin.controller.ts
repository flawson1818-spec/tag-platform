import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../access/decorators/current-user.decorator';
import { RequirePermission } from '../access/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../access/jwt-auth.guard';
import { PermissionGuard } from '../access/permission.guard';
import type { AuthenticatedUser } from '../access/interfaces/authenticated-user.interface';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { AuditLogService } from './audit-log.service';
import { BackupsService } from './backups.service';
import { SystemHealthService } from './system-health.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly auditLogService: AuditLogService,
    private readonly backupsService: BackupsService,
    private readonly systemHealthService: SystemHealthService,
  ) {}

  @Get('audit-logs')
  @UseGuards(PermissionGuard)
  @RequirePermission('audit_log.view')
  auditLogs(@Query() query: PaginationQueryDto & { entityType?: string }) {
    return this.auditLogService.list(query);
  }

  @Get('backups')
  @UseGuards(PermissionGuard)
  @RequirePermission('system.operate')
  listBackups(@Query() query: PaginationQueryDto) {
    return this.backupsService.list(query);
  }

  @Post('backups/run')
  @UseGuards(PermissionGuard)
  @RequirePermission('system.operate')
  runBackup(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.backupsService.run(currentUser.id);
  }

  @Get('system/health')
  @UseGuards(PermissionGuard)
  @RequirePermission('system.operate')
  health() {
    return this.systemHealthService.check();
  }
}
