import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { CommunicationModule } from '../communication/communication.module';
import { PostsModule } from '../posts/posts.module';
import { StorageModule } from '../storage/storage.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { AnnouncementsController } from './announcements.controller';
import { AnnouncementsService } from './announcements.service';
import { CommunitiesController } from './communities.controller';
import { CommunitiesService } from './communities.service';
import { CommunityDocumentsService } from './community-documents.service';
import { GroupLiveGateway } from './group-live.gateway';

@Module({
  imports: [SupabaseModule, AccessModule, PostsModule, StorageModule, CommunicationModule],
  controllers: [CommunitiesController, AnnouncementsController],
  providers: [CommunitiesService, AnnouncementsService, CommunityDocumentsService, GroupLiveGateway],
  exports: [CommunitiesService],
})
export class CommunitiesModule {}
