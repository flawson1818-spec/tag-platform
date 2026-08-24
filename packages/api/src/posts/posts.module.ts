import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';

@Module({
  imports: [SupabaseModule, AccessModule],
  controllers: [PostsController],
  providers: [PostsService],
  exports: [PostsService],
})
export class PostsModule {}
