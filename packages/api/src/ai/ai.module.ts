import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { AccessModule } from '../access/access.module';
import { AiController } from './ai.controller';
import { AiAgentsService } from './ai-agents.service';
import { AiModerationService } from './ai-moderation.service';

@Module({
  imports: [SupabaseModule, AccessModule],
  controllers: [AiController],
  providers: [AiAgentsService, AiModerationService],
  exports: [AiModerationService, AiAgentsService],
})
export class AiModule {}
