import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreatePrayerReminderDto } from './dto/create-prayer-reminder.dto';
import { UpdatePrayerReminderDto } from './dto/update-prayer-reminder.dto';
import { PrayerReminder } from './prayer-reminder.entity';

const REMINDER_COLUMNS = 'id, user_id, time_of_day, days_of_week, timezone, enabled, last_fired_at, created_at, updated_at';

/**
 * docs/01_FUNCTIONAL_SPECIFICATION.md §11 notification triggers: "Rappel de prière (planifié
 * par l'utilisateur)" — self-service, never seen or managed by anyone but the owner. A
 * brand-new, isolated table only touched by this service and PrayerReminderSchedulerService.
 */
@Injectable()
export class PrayerRemindersService {
  constructor(private readonly supabase: SupabaseService) {}

  private get db() {
    return this.supabase.client.from('prayer_reminders');
  }

  async create(userId: string, dto: CreatePrayerReminderDto): Promise<PrayerReminder> {
    const { data, error } = await this.db
      .insert({
        user_id: userId,
        time_of_day: dto.timeOfDay,
        days_of_week: dto.daysOfWeek,
        timezone: dto.timezone,
        enabled: dto.enabled ?? true,
      })
      .select(REMINDER_COLUMNS)
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return data as unknown as PrayerReminder;
  }

  async listForUser(userId: string): Promise<PrayerReminder[]> {
    const { data, error } = await this.db
      .select(REMINDER_COLUMNS)
      .eq('user_id', userId)
      .order('time_of_day', { ascending: true });
    if (error) throw new InternalServerErrorException(error.message);
    return data as unknown as PrayerReminder[];
  }

  async update(userId: string, id: string, dto: UpdatePrayerReminderDto): Promise<PrayerReminder> {
    const patch: Record<string, unknown> = {};
    if (dto.timeOfDay !== undefined) patch.time_of_day = dto.timeOfDay;
    if (dto.daysOfWeek !== undefined) patch.days_of_week = dto.daysOfWeek;
    if (dto.timezone !== undefined) patch.timezone = dto.timezone;
    if (dto.enabled !== undefined) patch.enabled = dto.enabled;

    const { data, error } = await this.db
      .update(patch)
      .eq('id', id)
      .eq('user_id', userId)
      .select(REMINDER_COLUMNS)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException(`Reminder ${id} not found`);
    return data as unknown as PrayerReminder;
  }

  async remove(userId: string, id: string): Promise<void> {
    const { error } = await this.db.delete().eq('id', id).eq('user_id', userId);
    if (error) throw new InternalServerErrorException(error.message);
  }

  /** Every currently-enabled reminder — the scheduler decides which ones are actually due. */
  async listEnabled(): Promise<PrayerReminder[]> {
    const { data, error } = await this.db.select(REMINDER_COLUMNS).eq('enabled', true);
    if (error) throw new InternalServerErrorException(error.message);
    return data as unknown as PrayerReminder[];
  }

  async markFired(id: string, firedAt: string): Promise<void> {
    const { error } = await this.db.update({ last_fired_at: firedAt }).eq('id', id);
    if (error) throw new InternalServerErrorException(error.message);
  }
}
