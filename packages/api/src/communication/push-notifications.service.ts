import { Injectable, InternalServerErrorException, Logger, Optional } from '@nestjs/common';
import * as webpush from 'web-push';
import { SupabaseService } from '../supabase/supabase.service';
import { PushNotification, PushPlatform, PushToken } from './push-token.entity';

const PUSH_TOKEN_COLUMNS = 'id, user_id, token, platform, created_at';
const PUSH_NOTIFICATION_COLUMNS = 'id, user_id, push_token_id, title, body, status, sent_at, created_at';

/**
 * Real 'web-push' exports live on a frozen ESM namespace object that Vitest cannot vi.spyOn or
 * vi.mock reliably in this project (see push-notifications.service.spec.ts) — injecting this
 * narrow interface instead of importing `webpush` directly everywhere lets tests pass a plain
 * fake object, no module interception needed.
 */
export interface WebPushClient {
  setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
  sendNotification(subscription: webpush.PushSubscription, payload: string): Promise<unknown>;
}

/**
 * IOS/ANDROID native push still has no FCM/APNs project configured (see the "Push, Email,
 * WhatsApp" channel list in docs/01_FUNCTIONAL_SPECIFICATION.md section 11) — those tokens are
 * recorded at status 'CREATED' without an actual send attempt. WEB is different: browser Web
 * Push only needs a self-generated VAPID keypair (no external account), so it's wired for real
 * delivery via the `web-push` library once VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY are set.
 */
@Injectable()
export class PushNotificationsService {
  private readonly logger = new Logger(PushNotificationsService.name);
  private vapidConfigured = false;

  constructor(
    private readonly supabase: SupabaseService,
    @Optional() private readonly webpushClient: WebPushClient = webpush,
  ) {
    const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
    if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
      this.webpushClient.setVapidDetails(VAPID_SUBJECT ?? 'mailto:admin@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
      this.vapidConfigured = true;
    }
  }

  getVapidPublicKey(): string | null {
    return process.env.VAPID_PUBLIC_KEY || null;
  }

  async registerToken(userId: string, token: string, platform: PushPlatform = 'UNKNOWN'): Promise<PushToken> {
    const { data, error } = await this.supabase.client
      .from('push_tokens')
      .upsert({ user_id: userId, token, platform }, { onConflict: 'user_id,token' })
      .select(PUSH_TOKEN_COLUMNS)
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return data as unknown as PushToken;
  }

  async unregisterToken(userId: string, token: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('push_tokens')
      .delete()
      .eq('user_id', userId)
      .eq('token', token);
    if (error) throw new InternalServerErrorException(error.message);
  }

  /** Sends to every device currently registered for userId (fans out one row per token). */
  async send(userId: string, title: string, body: string): Promise<PushNotification[]> {
    const { data: tokens, error: tokensError } = await this.supabase.client
      .from('push_tokens')
      .select(PUSH_TOKEN_COLUMNS)
      .eq('user_id', userId);
    if (tokensError) throw new InternalServerErrorException(tokensError.message);

    const targets = (tokens as unknown as PushToken[] | null) ?? [];
    if (targets.length === 0) {
      this.logger.warn(`Push "${title}" not recorded — user ${userId} has no registered device`);
      return [];
    }

    const results = await Promise.all(targets.map((t) => this.deliver(t, title, body)));

    const { data, error } = await this.supabase.client
      .from('push_notifications')
      .insert(
        targets.map((t, i) => ({
          user_id: userId,
          push_token_id: t.id,
          title,
          body,
          status: results[i],
          sent_at: results[i] === 'DELIVERED' ? new Date().toISOString() : null,
        })),
      )
      .select(PUSH_NOTIFICATION_COLUMNS);
    if (error) throw new InternalServerErrorException(error.message);
    return data as unknown as PushNotification[];
  }

  private async deliver(target: PushToken, title: string, body: string): Promise<'DELIVERED' | 'FAILED' | 'CREATED'> {
    if (target.platform !== 'WEB' || !this.vapidConfigured) {
      this.logger.warn(`Push "${title}" recorded for device ${target.id} but NOT sent — no provider configured`);
      return 'CREATED';
    }

    try {
      const subscription = JSON.parse(target.token) as webpush.PushSubscription;
      await this.webpushClient.sendNotification(subscription, JSON.stringify({ title, body }));
      return 'DELIVERED';
    } catch (error) {
      this.logger.error(`Web Push delivery failed for device ${target.id}`, error as Error);
      return 'FAILED';
    }
  }
}
