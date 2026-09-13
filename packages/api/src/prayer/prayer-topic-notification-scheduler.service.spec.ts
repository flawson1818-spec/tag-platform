import { PrayerTopicNotificationSchedulerService } from './prayer-topic-notification-scheduler.service';
import { createQueryChain, createSupabaseServiceMock } from '../testing/supabase-query-mock';

const RUNNING_SLOT = { id: 'slot-1', title: 'Prions pour les malades', category: 'Santé' };

function buildScheduler(
  perTable: Record<string, ReturnType<typeof createQueryChain>>,
  overrides: Partial<Record<string, unknown>> = {},
) {
  const supabase = createSupabaseServiceMock(perTable);
  const followsService = overrides.followsService ?? { listFollowerIds: vi.fn().mockResolvedValue([]) };
  const notificationsService = overrides.notificationsService ?? { create: vi.fn().mockResolvedValue(undefined) };
  const pushNotificationsService = overrides.pushNotificationsService ?? { send: vi.fn().mockResolvedValue([]) };
  const scheduler = new PrayerTopicNotificationSchedulerService(
    supabase as never,
    followsService as never,
    notificationsService as never,
    pushNotificationsService as never,
  );
  return { scheduler, followsService, notificationsService, pushNotificationsService };
}

describe('PrayerTopicNotificationSchedulerService', () => {
  it('notifies every follower of a recently-started slot\'s category', async () => {
    const { scheduler, notificationsService, pushNotificationsService } = buildScheduler(
      {
        prayer_slots: createQueryChain({ data: [RUNNING_SLOT], error: null }),
        notifications: createQueryChain({ data: null, error: null }),
      },
      { followsService: { listFollowerIds: vi.fn().mockResolvedValue(['user-1', 'user-2']) } },
    );

    await scheduler.checkRecentlyStartedSlots();

    expect(notificationsService.create).toHaveBeenCalledWith('user-1', 'PRAYER_TOPIC_STARTED', {
      slotId: 'slot-1',
      category: 'Santé',
    });
    expect(notificationsService.create).toHaveBeenCalledWith('user-2', 'PRAYER_TOPIC_STARTED', expect.anything());
    expect(pushNotificationsService.send).toHaveBeenCalledTimes(2);
  });

  it('only queries RUNNING slots that started within the lookback window', async () => {
    const slotsChain = createQueryChain({ data: [], error: null });
    const { scheduler } = buildScheduler({ prayer_slots: slotsChain });

    await scheduler.checkRecentlyStartedSlots();

    expect(slotsChain.eq).toHaveBeenCalledWith('status', 'RUNNING');
    expect(slotsChain.gte).toHaveBeenCalledWith('start_at', expect.any(String));
  });

  it('does not notify a follower twice for the same slot', async () => {
    const { scheduler, notificationsService } = buildScheduler(
      {
        prayer_slots: createQueryChain({ data: [RUNNING_SLOT], error: null }),
        notifications: createQueryChain({ data: { id: 'notif-1' }, error: null }),
      },
      { followsService: { listFollowerIds: vi.fn().mockResolvedValue(['user-1']) } },
    );

    await scheduler.checkRecentlyStartedSlots();

    expect(notificationsService.create).not.toHaveBeenCalled();
  });

  it('never throws when the slots lookup itself fails', async () => {
    const { scheduler } = buildScheduler({
      prayer_slots: createQueryChain({ data: null, error: { message: 'db down' } }),
    });

    await expect(scheduler.checkRecentlyStartedSlots()).resolves.toBeUndefined();
  });

  it('still notifies the other follower when one notification fails', async () => {
    const { scheduler, notificationsService } = buildScheduler(
      {
        prayer_slots: createQueryChain({ data: [RUNNING_SLOT], error: null }),
        notifications: createQueryChain({ data: null, error: null }),
      },
      {
        followsService: { listFollowerIds: vi.fn().mockResolvedValue(['user-1', 'user-2']) },
        notificationsService: {
          create: vi.fn((userId: string) => (userId === 'user-1' ? Promise.reject(new Error('boom')) : Promise.resolve(undefined))),
        },
      },
    );

    await scheduler.checkRecentlyStartedSlots();

    expect(notificationsService.create).toHaveBeenCalledWith('user-2', 'PRAYER_TOPIC_STARTED', expect.anything());
  });
});
