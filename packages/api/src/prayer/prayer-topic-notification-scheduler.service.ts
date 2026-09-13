import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { NotificationsService } from '../communication/notifications.service';
import { PushNotificationsService } from '../communication/push-notifications.service';
import { SupabaseService } from '../supabase/supabase.service';
import { PrayerCategoryFollowsService } from './prayer-category-follows.service';

const CHECK_INTERVAL_MS = 60_000;
/** Slightly larger than the check interval so a little timer drift never skips a slot — the
 *  notifications-table dedup below guarantees at most one notification per (user, slot) anyway. */
const LOOKBACK_MS = 90_000;

type RecentlyStartedSlot = { id: string; title: string; category: string };

/**
 * docs/01_FUNCTIONAL_SPECIFICATION.md §11 notification triggers: "Début d'un sujet suivi/favori".
 * Deliberately kept out of PrayerSlotsService.activate() itself (that method is called from many
 * places — engine tick, urgent injection, promote — and has 17 direct unit-test call sites; a new
 * required dependency there would touch all of them for a purely additive, best-effort feature).
 * Polling for "recently started" slots and de-duping via the existing notifications table keeps
 * this fully decoupled instead.
 */
@Injectable()
export class PrayerTopicNotificationSchedulerService {
  private readonly logger = new Logger(PrayerTopicNotificationSchedulerService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly followsService: PrayerCategoryFollowsService,
    private readonly notificationsService: NotificationsService,
    private readonly pushNotificationsService: PushNotificationsService,
  ) {}

  @Interval(CHECK_INTERVAL_MS)
  async checkRecentlyStartedSlots(): Promise<void> {
    let slots: RecentlyStartedSlot[];
    try {
      const since = new Date(Date.now() - LOOKBACK_MS).toISOString();
      const { data, error } = await this.supabase.client
        .from('prayer_slots')
        .select('id, title, category')
        .eq('status', 'RUNNING')
        .gte('start_at', since);
      if (error) throw new InternalServerErrorException(error.message);
      slots = data as unknown as RecentlyStartedSlot[];
    } catch (error) {
      this.logger.error('Failed to load recently-started slots for topic followers', error as Error);
      return;
    }

    for (const slot of slots) {
      await this.notifyFollowers(slot);
    }
  }

  private async notifyFollowers(slot: RecentlyStartedSlot): Promise<void> {
    try {
      const followerIds = await this.followsService.listFollowerIds(slot.category);
      await Promise.all(followerIds.map((userId) => this.notifyOnce(userId, slot)));
    } catch (error) {
      this.logger.error(`Failed to look up followers of category ${slot.category}`, error as Error);
    }
  }

  private async notifyOnce(userId: string, slot: RecentlyStartedSlot): Promise<void> {
    try {
      if (await this.alreadyNotified(userId, slot.id)) return;

      await this.notificationsService.create(userId, 'PRAYER_TOPIC_STARTED', { slotId: slot.id, category: slot.category });
      await this.pushNotificationsService.send(
        userId,
        `Un sujet "${slot.category}" vient de commencer`,
        slot.title,
      );
    } catch (error) {
      this.logger.error(`Failed to notify user ${userId} of slot ${slot.id}`, error as Error);
    }
  }

  private async alreadyNotified(userId: string, slotId: string): Promise<boolean> {
    const { data, error } = await this.supabase.client
      .from('notifications')
      .select('id')
      .eq('user_id', userId)
      .eq('type', 'PRAYER_TOPIC_STARTED')
      .eq('payload->>slotId', slotId)
      .limit(1)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    return Boolean(data);
  }
}
