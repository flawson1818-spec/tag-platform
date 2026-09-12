import { PrayerRemindersService } from './prayer-reminders.service';
import { createQueryChain, createSupabaseServiceMock } from '../testing/supabase-query-mock';

function buildService(chain: ReturnType<typeof createQueryChain>) {
  const supabase = createSupabaseServiceMock({ prayer_reminders: chain });
  return new PrayerRemindersService(supabase as never);
}

const REMINDER = {
  id: 'reminder-1',
  user_id: 'user-1',
  time_of_day: '06:30',
  days_of_week: [1, 2, 3, 4, 5],
  timezone: 'Europe/Paris',
  enabled: true,
  last_fired_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

describe('PrayerRemindersService', () => {
  describe('create', () => {
    it('creates a reminder for the given user, defaulting enabled to true', async () => {
      const chain = createQueryChain({ data: REMINDER, error: null });
      const service = buildService(chain);

      const result = await service.create('user-1', {
        timeOfDay: '06:30',
        daysOfWeek: [1, 2, 3, 4, 5],
        timezone: 'Europe/Paris',
      });

      expect(chain.insert).toHaveBeenCalledWith({
        user_id: 'user-1',
        time_of_day: '06:30',
        days_of_week: [1, 2, 3, 4, 5],
        timezone: 'Europe/Paris',
        enabled: true,
      });
      expect(result).toEqual(REMINDER);
    });

    it('respects an explicit enabled: false', async () => {
      const chain = createQueryChain({ data: { ...REMINDER, enabled: false }, error: null });
      const service = buildService(chain);

      await service.create('user-1', { timeOfDay: '06:30', daysOfWeek: [1], timezone: 'UTC', enabled: false });

      expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
    });
  });

  describe('listForUser', () => {
    it('scopes to the given user only', async () => {
      const chain = createQueryChain({ data: [REMINDER], error: null });
      const service = buildService(chain);

      await service.listForUser('user-1');

      expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1');
    });
  });

  describe('update', () => {
    it('only patches the fields that were actually given', async () => {
      const chain = createQueryChain({ data: REMINDER, error: null });
      const service = buildService(chain);

      await service.update('user-1', 'reminder-1', { enabled: false });

      expect(chain.update).toHaveBeenCalledWith({ enabled: false });
      expect(chain.eq).toHaveBeenCalledWith('id', 'reminder-1');
      expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1');
    });

    it('throws when the reminder does not belong to this user (or does not exist)', async () => {
      const chain = createQueryChain({ data: null, error: null });
      const service = buildService(chain);

      await expect(service.update('user-1', 'not-mine', { enabled: false })).rejects.toThrow('not found');
    });
  });

  describe('remove', () => {
    it('deletes only that user\'s own reminder', async () => {
      const chain = createQueryChain({ data: null, error: null });
      const service = buildService(chain);

      await service.remove('user-1', 'reminder-1');

      expect(chain.eq).toHaveBeenCalledWith('id', 'reminder-1');
      expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1');
    });
  });

  describe('listEnabled', () => {
    it('filters to enabled reminders only', async () => {
      const chain = createQueryChain({ data: [REMINDER], error: null });
      const service = buildService(chain);

      await service.listEnabled();

      expect(chain.eq).toHaveBeenCalledWith('enabled', true);
    });
  });

  describe('markFired', () => {
    it('stamps last_fired_at', async () => {
      const chain = createQueryChain({ data: null, error: null });
      const service = buildService(chain);

      await service.markFired('reminder-1', '2026-01-01T06:30:00.000Z');

      expect(chain.update).toHaveBeenCalledWith({ last_fired_at: '2026-01-01T06:30:00.000Z' });
    });
  });
});
