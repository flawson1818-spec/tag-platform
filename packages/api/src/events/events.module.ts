import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [SupabaseModule, AccessModule],
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventsModule {}
