import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AccessModule } from '../access/access.module';
import { AiModule } from '../ai/ai.module';
import { CommunicationModule } from '../communication/communication.module';
import { StorageModule } from '../storage/storage.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { ChatMessagesService } from './chat-messages.service';
import { PrayerCampaignsController } from './prayer-campaigns.controller';
import { PrayerCampaignsService } from './prayer-campaigns.service';
import { PrayerEngineService } from './prayer-engine.service';
import { PrayerProgramsController } from './prayer-programs.controller';
import { PrayerProgramsService } from './prayer-programs.service';
import { PrayerRealtimeGateway } from './prayer-realtime.gateway';
import { PrayerReminderSchedulerService } from './prayer-reminder-scheduler.service';
import { PrayerRemindersController } from './prayer-reminders.controller';
import { PrayerRemindersService } from './prayer-reminders.service';
import { PrayerRequestsController } from './prayer-requests.controller';
import { PrayerRequestsService } from './prayer-requests.service';
import { PrayerSlotsController } from './prayer-slots.controller';
import { PrayerSlotsService } from './prayer-slots.service';
import { PrayerTestimoniesController } from './prayer-testimonies.controller';
import { PrayerTestimoniesService } from './prayer-testimonies.service';

@Module({
  imports: [SupabaseModule, AccessModule, CommunicationModule, StorageModule, AiModule, ScheduleModule.forRoot()],
  controllers: [
    PrayerProgramsController,
    PrayerSlotsController,
    PrayerRequestsController,
    PrayerTestimoniesController,
    PrayerCampaignsController,
    PrayerRemindersController,
  ],
  providers: [
    PrayerProgramsService,
    PrayerSlotsService,
    PrayerRequestsService,
    PrayerTestimoniesService,
    PrayerCampaignsService,
    PrayerRealtimeGateway,
    PrayerEngineService,
    ChatMessagesService,
    PrayerRemindersService,
    PrayerReminderSchedulerService,
  ],
})
export class PrayerModule {}
