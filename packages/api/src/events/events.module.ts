import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { CommunicationModule } from '../communication/communication.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { EventBreakoutRoomsService } from './event-breakout-rooms.service';
import { EventPollsService } from './event-polls.service';
import { EventReminderSchedulerService } from './event-reminder-scheduler.service';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [SupabaseModule, AccessModule, CommunicationModule],
  controllers: [EventsController],
  providers: [EventsService, EventBreakoutRoomsService, EventPollsService, EventReminderSchedulerService],
})
export class EventsModule {}
