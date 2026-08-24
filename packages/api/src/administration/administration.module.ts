import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { AdminController } from './admin.controller';
import { AuditLogService } from './audit-log.service';
import { BackupsService } from './backups.service';
import { SystemHealthService } from './system-health.service';

@Module({
  imports: [SupabaseModule, AccessModule],
  controllers: [AdminController],
  providers: [AuditLogService, BackupsService, SystemHealthService],
  exports: [AuditLogService],
})
export class AdministrationModule {}
