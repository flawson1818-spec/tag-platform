import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { WatchController } from './watch.controller';
import { WatchService } from './watch.service';

@Module({
  imports: [SupabaseModule, AccessModule],
  controllers: [WatchController],
  providers: [WatchService],
})
export class WatchModule {}
