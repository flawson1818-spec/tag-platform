import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { AccessModule } from '../access/access.module';
import { CommunicationModule } from '../communication/communication.module';
import { AiController } from './ai.controller';
import { AiAgentsService } from './ai-agents.service';
import { AiModerationService } from './ai-moderation.service';

@Module({
  imports: [SupabaseModule, AccessModule, CommunicationModule],
  controllers: [AiController],
  providers: [AiAgentsService, AiModerationService],
  exports: [AiModerationService, AiAgentsService],
})
export class AiModule {}
