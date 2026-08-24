import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { AdministrationModule } from '../administration/administration.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

@Module({
  imports: [SupabaseModule, AccessModule, AdministrationModule],
  controllers: [RolesController],
  providers: [RolesService],
  exports: [RolesService],
})
export class RolesModule {}
