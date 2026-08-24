import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { EmailService } from './email.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PushNotificationsController } from './push-notifications.controller';
import { PushNotificationsService } from './push-notifications.service';
import { SocialPublicationsController } from './social-publications.controller';
import { SocialPublicationsService } from './social-publications.service';
import { WhatsAppService } from './whatsapp.service';

@Module({
  imports: [SupabaseModule, AccessModule],
  controllers: [NotificationsController, SocialPublicationsController, PushNotificationsController],
  providers: [EmailService, NotificationsService, SocialPublicationsService, WhatsAppService, PushNotificationsService],
  exports: [EmailService, NotificationsService, SocialPublicationsService, WhatsAppService, PushNotificationsService],
})
export class CommunicationModule {}
