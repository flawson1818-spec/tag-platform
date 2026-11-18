import { Module } from '@nestjs/common';
import { CommunicationModule } from '../communication/communication.module';
import { AccessModule } from '../access/access.module';
import { StorageModule } from '../storage/storage.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { MessagesController } from './messages.controller';
import { MessagesGateway } from './messages.gateway';
import { MessagesService } from './messages.service';

@Module({
  imports: [SupabaseModule, AccessModule, StorageModule, CommunicationModule],
  controllers: [MessagesController],
  providers: [MessagesService, MessagesGateway],
})
export class MessagesModule {}
