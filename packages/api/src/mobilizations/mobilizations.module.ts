import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { CommunicationModule } from '../communication/communication.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { MobilizationsController } from './mobilizations.controller';
import { MobilizationsService } from './mobilizations.service';

@Module({
  imports: [SupabaseModule, AccessModule, CommunicationModule],
  controllers: [MobilizationsController],
  providers: [MobilizationsService],
})
export class MobilizationsModule {}
