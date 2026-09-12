import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { NotificationsService } from '../communication/notifications.service';
import { PushNotificationsService } from '../communication/push-notifications.service';
import { SupabaseService } from '../supabase/supabase.service';
import { Event } from './event.entity';

const CHECK_INTERVAL_MS = 5 * 60_000;
const REMINDER_LEAD_MINUTES = 60;

type UpcomingEvent = Pick<Event, 'id' | 'title' | 'scheduled_at'>;

/**
 * docs/07_UX_UI_SPECIFICATION.md §7 parcours utilisateur: "Découverte → inscription → rappel
 * notification → participation live...". Checked every 5 minutes rather than matched to an
 * exact instant — an upcoming event stays in the reminder window for a while, and de-duping
 * against the existing `notifications` table (rather than a new column on events/
 * event_participants) is enough to guarantee at most one reminder per participant per event.
 */
@Injectable()
export class EventReminderSchedulerService {
  private readonly logger = new Logger(EventReminderSchedulerService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly notificationsService: NotificationsService,
    private readonly pushNotificationsService: PushNotificationsService,
  ) {}

  @Interval(CHECK_INTERVAL_MS)
  async checkUpcomingEvents(): Promise<void> {
    let events: UpcomingEvent[];
    try {
      const windowEnd = new Date(Date.now() + REMINDER_LEAD_MINUTES * 60_000).toISOString();
      const { data, error } = await this.supabase.client
        .from('events')
        .select('id, title, scheduled_at')
        .in('status', ['SCHEDULED', 'OPEN'])
        .is('deleted_at', null)
        .gt('scheduled_at', new Date().toISOString())
        .lte('scheduled_at', windowEnd);
      if (error) throw new InternalServerErrorException(error.message);
      events = data as unknown as UpcomingEvent[];
    } catch (error) {
      this.logger.error('Failed to load upcoming events for reminders', error as Error);
      return;
    }

    for (const event of events) {
      await this.remindParticipants(event);
    }
  }

  private async remindParticipants(event: UpcomingEvent): Promise<void> {
    try {
      const { data, error } = await this.supabase.client
        .from('event_participants')
        .select('user_id')
        .eq('event_id', event.id);
      if (error) throw new InternalServerErrorException(error.message);

      const userIds = (data as unknown as { user_id: string }[]).map((p) => p.user_id);
      await Promise.all(userIds.map((userId) => this.remindOnce(userId, event)));
    } catch (error) {
      this.logger.error(`Failed to look up participants to remind for event ${event.id}`, error as Error);
    }
  }

  private async remindOnce(userId: string, event: UpcomingEvent): Promise<void> {
    try {
      if (await this.alreadyReminded(userId, event.id)) return;

      await this.notificationsService.create(userId, 'EVENT_REMINDER', { eventId: event.id, title: event.title });
      await this.pushNotificationsService.send(
        userId,
        `Bientôt : ${event.title}`,
        `Cet événement auquel tu es inscrit commence dans moins d'une heure.`,
      );
    } catch (error) {
      this.logger.error(`Failed to remind user ${userId} of event ${event.id}`, error as Error);
    }
  }

  private async alreadyReminded(userId: string, eventId: string): Promise<boolean> {
    const { data, error } = await this.supabase.client
      .from('notifications')
      .select('id')
      .eq('user_id', userId)
      .eq('type', 'EVENT_REMINDER')
      .eq('payload->>eventId', eventId)
      .limit(1)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    return Boolean(data);
  }
}
