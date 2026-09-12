import { PrayerReminderSchedulerService } from './prayer-reminder-scheduler.service';
import { PrayerReminder } from './prayer-reminder.entity';

const NOW_ISO = '2026-01-05T06:45:00.000Z'; // a fixed instant — UTC weekday/time derived from it below
const NOW_WEEKDAY = new Date(NOW_ISO).getUTCDay();

function buildReminder(overrides: Partial<PrayerReminder> = {}): PrayerReminder {
  return {
    id: 'reminder-1',
    user_id: 'user-1',
    time_of_day: '06:30',
    days_of_week: [NOW_WEEKDAY],
    timezone: 'UTC',
    enabled: true,
    last_fired_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function buildScheduler(overrides: Partial<Record<string, unknown>> = {}) {
  const remindersService = overrides.remindersService ?? {
    listEnabled: vi.fn().mockResolvedValue([]),
    markFired: vi.fn().mockResolvedValue(undefined),
  };
  const notificationsService = overrides.notificationsService ?? { create: vi.fn().mockResolvedValue(undefined) };
  const pushNotificationsService = overrides.pushNotificationsService ?? { send: vi.fn().mockResolvedValue([]) };

  const scheduler = new PrayerReminderSchedulerService(
    remindersService as never,
    notificationsService as never,
    pushNotificationsService as never,
  );
  return { scheduler, remindersService, notificationsService, pushNotificationsService };
}

describe('PrayerReminderSchedulerService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW_ISO));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires and marks as fired for a due reminder', async () => {
    const reminder = buildReminder();
    const { scheduler, notificationsService, pushNotificationsService, remindersService } = buildScheduler({
      remindersService: { listEnabled: vi.fn().mockResolvedValue([reminder]), markFired: vi.fn().mockResolvedValue(undefined) },
    });

    await scheduler.checkDueReminders();

    expect(notificationsService.create).toHaveBeenCalledWith('user-1', 'PRAYER_REMINDER', { reminderId: 'reminder-1' });
    expect(pushNotificationsService.send).toHaveBeenCalledWith('user-1', expect.any(String), expect.any(String));
    expect(remindersService.markFired).toHaveBeenCalledWith('reminder-1', NOW_ISO);
  });

  it('does not fire when today is not one of the scheduled weekdays', async () => {
    const reminder = buildReminder({ days_of_week: [(NOW_WEEKDAY + 1) % 7] });
    const { scheduler, notificationsService } = buildScheduler({
      remindersService: { listEnabled: vi.fn().mockResolvedValue([reminder]), markFired: vi.fn() },
    });

    await scheduler.checkDueReminders();

    expect(notificationsService.create).not.toHaveBeenCalled();
  });

  it('does not fire before the scheduled time of day', async () => {
    const reminder = buildReminder({ time_of_day: '23:59' });
    const { scheduler, notificationsService } = buildScheduler({
      remindersService: { listEnabled: vi.fn().mockResolvedValue([reminder]), markFired: vi.fn() },
    });

    await scheduler.checkDueReminders();

    expect(notificationsService.create).not.toHaveBeenCalled();
  });

  it('does not fire twice on the same local day', async () => {
    const reminder = buildReminder({ last_fired_at: '2026-01-05T00:05:00.000Z' });
    const { scheduler, notificationsService } = buildScheduler({
      remindersService: { listEnabled: vi.fn().mockResolvedValue([reminder]), markFired: vi.fn() },
    });

    await scheduler.checkDueReminders();

    expect(notificationsService.create).not.toHaveBeenCalled();
  });

  it('fires again once the local day has changed since the last firing', async () => {
    const reminder = buildReminder({ last_fired_at: '2026-01-04T06:30:00.000Z' });
    const { scheduler, notificationsService } = buildScheduler({
      remindersService: { listEnabled: vi.fn().mockResolvedValue([reminder]), markFired: vi.fn().mockResolvedValue(undefined) },
    });

    await scheduler.checkDueReminders();

    expect(notificationsService.create).toHaveBeenCalled();
  });

  it('still marks as fired even when sending the notification fails (never retries all day)', async () => {
    const reminder = buildReminder();
    const { scheduler, remindersService } = buildScheduler({
      remindersService: { listEnabled: vi.fn().mockResolvedValue([reminder]), markFired: vi.fn().mockResolvedValue(undefined) },
      notificationsService: { create: vi.fn().mockRejectedValue(new Error('notify failed')) },
    });

    await scheduler.checkDueReminders();

    expect(remindersService.markFired).toHaveBeenCalledWith('reminder-1', NOW_ISO);
  });

  it('never throws when listEnabled() itself fails', async () => {
    const { scheduler } = buildScheduler({
      remindersService: { listEnabled: vi.fn().mockRejectedValue(new Error('db down')), markFired: vi.fn() },
    });

    await expect(scheduler.checkDueReminders()).resolves.toBeUndefined();
  });
});
