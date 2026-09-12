import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { NotificationsService } from '../communication/notifications.service';
import { PushNotificationsService } from '../communication/push-notifications.service';
import { PrayerReminder } from './prayer-reminder.entity';
import { PrayerRemindersService } from './prayer-reminders.service';

const CHECK_INTERVAL_MS = 60_000;
const WEEKDAY_CODES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface LocalTimeParts {
  weekday: number;
  hhmm: string;
  dateKey: string;
}

/** Formats `date` in `timeZone`, tolerating an unrecognized zone the same way analytics.service.ts already does elsewhere. */
function localParts(timeZone: string, date: Date): LocalTimeParts | null {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      hourCycle: 'h23',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);

    const map: Record<string, string> = {};
    for (const part of parts) map[part.type] = part.value;

    const weekday = WEEKDAY_CODES.indexOf(map.weekday);
    if (weekday < 0 || !map.hour || !map.minute || !map.year) return null;
    return { weekday, hhmm: `${map.hour}:${map.minute}`, dateKey: `${map.year}-${map.month}-${map.day}` };
  } catch {
    return null;
  }
}

/**
 * docs/01_FUNCTIONAL_SPECIFICATION.md §11: "Rappel de prière (planifié par l'utilisateur)".
 * Checked once a minute rather than matched to an exact minute — a reminder fires the first
 * tick at or after its scheduled time each day it's active, tracked via last_fired_at so a
 * restart or an imprecise tick never double-sends the same day.
 */
@Injectable()
export class PrayerReminderSchedulerService {
  private readonly logger = new Logger(PrayerReminderSchedulerService.name);

  constructor(
    private readonly remindersService: PrayerRemindersService,
    private readonly notificationsService: NotificationsService,
    private readonly pushNotificationsService: PushNotificationsService,
  ) {}

  @Interval(CHECK_INTERVAL_MS)
  async checkDueReminders(): Promise<void> {
    let reminders: PrayerReminder[];
    try {
      reminders = await this.remindersService.listEnabled();
    } catch (error) {
      this.logger.error('Failed to load enabled prayer reminders', error as Error);
      return;
    }

    const now = new Date();
    for (const reminder of reminders) {
      if (!this.isDue(reminder, now)) continue;
      await this.fire(reminder, now);
    }
  }

  private isDue(reminder: PrayerReminder, now: Date): boolean {
    const local = localParts(reminder.timezone, now);
    if (!local) return false;
    if (!reminder.days_of_week.includes(local.weekday)) return false;
    if (local.hhmm < reminder.time_of_day) return false;

    if (reminder.last_fired_at) {
      const lastLocal = localParts(reminder.timezone, new Date(reminder.last_fired_at));
      if (lastLocal?.dateKey === local.dateKey) return false;
    }
    return true;
  }

  private async fire(reminder: PrayerReminder, now: Date): Promise<void> {
    try {
      await this.notificationsService.create(reminder.user_id, 'PRAYER_REMINDER', { reminderId: reminder.id });
      await this.pushNotificationsService.send(
        reminder.user_id,
        'Rappel de prière',
        "C'est l'heure que tu t'étais fixée pour prier — rejoins la salle quand tu es prêt.",
      );
    } catch (error) {
      this.logger.error(`Failed to fire prayer reminder ${reminder.id}`, error as Error);
    } finally {
      // Marked fired even on a notification failure — otherwise a persistently-failing send
      // (e.g. a bad push subscription) would retry every minute for the rest of the day.
      await this.remindersService.markFired(reminder.id, now.toISOString()).catch((error) => {
        this.logger.error(`Failed to mark prayer reminder ${reminder.id} as fired`, error as Error);
      });
    }
  }
}
