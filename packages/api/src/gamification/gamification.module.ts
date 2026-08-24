import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { AccessModule } from '../access/access.module';
import { GamificationController } from './gamification.controller';
import { GamificationService } from './gamification.service';

@Module({
  imports: [SupabaseModule, AccessModule],
  controllers: [GamificationController],
  providers: [GamificationService],
})
export class GamificationModule {}
