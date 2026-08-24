import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { PostsModule } from '../posts/posts.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { CommunitiesController } from './communities.controller';
import { CommunitiesService } from './communities.service';

@Module({
  imports: [SupabaseModule, AccessModule, PostsModule],
  controllers: [CommunitiesController],
  providers: [CommunitiesService],
  exports: [CommunitiesService],
})
export class CommunitiesModule {}
