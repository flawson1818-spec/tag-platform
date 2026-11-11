import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { IntercessorsController } from './intercessors.controller';
import { IntercessorsService } from './intercessors.service';

@Module({
  imports: [SupabaseModule, AccessModule],
  controllers: [IntercessorsController],
  providers: [IntercessorsService],
  exports: [IntercessorsService],
})
export class IntercessorsModule {}
