import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { StorageModule } from '../storage/storage.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { SocialController } from './social.controller';
import { SocialService } from './social.service';

@Module({
  imports: [SupabaseModule, AccessModule, StorageModule],
  controllers: [SocialController],
  providers: [SocialService],
})
export class SocialModule {}
