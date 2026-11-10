import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { CommunicationModule } from '../communication/communication.module';
import { CommunitiesModule } from '../communities/communities.module';
import { RolesModule } from '../roles/roles.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';

@Module({
  imports: [SupabaseModule, AccessModule, RolesModule, CommunitiesModule, CommunicationModule],
  controllers: [ApplicationsController],
  providers: [ApplicationsService],
})
export class ApplicationsModule {}
