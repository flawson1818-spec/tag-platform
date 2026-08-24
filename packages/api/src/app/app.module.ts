import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule, seconds } from '@nestjs/throttler';
import { SupabaseModule } from '../supabase/supabase.module';
import { TagsModule } from '../tags/tags.module';
import { ItemsModule } from '../items/items.module';
import { AccessModule } from '../access/access.module';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { RolesModule } from '../roles/roles.module';
import { CommunitiesModule } from '../communities/communities.module';
import { PostsModule } from '../posts/posts.module';
import { PrayerModule } from '../prayer/prayer.module';
import { CommunicationModule } from '../communication/communication.module';
import { StorageModule } from '../storage/storage.module';
import { AdministrationModule } from '../administration/administration.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { EventsModule } from '../events/events.module';
import { AiModule } from '../ai/ai.module';
import { GamificationModule } from '../gamification/gamification.module';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // No numeric target in docs/12_SECURITY_SPECIFICATION.md (just "Rate Limit" as a checklist
    // item) — 100 req/min/IP is a conservative general-purpose default; endpoints that need a
    // tighter budget (auth) override it locally with @Throttle().
    ThrottlerModule.forRoot([{ name: 'default', ttl: seconds(60), limit: 100 }]),
    SupabaseModule,
    TagsModule,
    ItemsModule,
    AccessModule,
    AuthModule,
    UsersModule,
    RolesModule,
    CommunitiesModule,
    PostsModule,
    PrayerModule,
    CommunicationModule,
    StorageModule,
    AdministrationModule,
    AnalyticsModule,
    EventsModule,
    AiModule,
    GamificationModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
