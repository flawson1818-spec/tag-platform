import { Module } from '@nestjs/common';
import { PrayerModule } from '../prayer/prayer.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { SpeechController } from './speech.controller';
import { SpeechService } from './speech.service';

@Module({
  imports: [SupabaseModule, PrayerModule],
  controllers: [SpeechController],
  providers: [SpeechService],
})
export class SpeechModule {}
