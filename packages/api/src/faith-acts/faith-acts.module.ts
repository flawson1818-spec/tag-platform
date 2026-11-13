import { Module } from '@nestjs/common';
import { PrayerModule } from '../prayer/prayer.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { FaithActsController } from './faith-acts.controller';
import { FaithActsService } from './faith-acts.service';

@Module({
  imports: [SupabaseModule, PrayerModule],
  controllers: [FaithActsController],
  providers: [FaithActsService],
})
export class FaithActsModule {}
