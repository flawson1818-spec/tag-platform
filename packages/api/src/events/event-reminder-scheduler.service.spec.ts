import { EventReminderSchedulerService } from './event-reminder-scheduler.service';
import { createQueryChain, createSupabaseServiceMock } from '../testing/supabase-query-mock';

const UPCOMING_EVENT = { id: 'event-1', title: 'Veillée mondiale', scheduled_at: '2026-01-01T20:00:00.000Z' };

function buildScheduler(perTable: Record<string, ReturnType<typeof createQueryChain>>, overrides: Partial<Record<string, unknown>> = {}) {
  const supabase = createSupabaseServiceMock(perTable);
  const notificationsService = overrides.notificationsService ?? { create: vi.fn().mockResolvedValue(undefined) };
  const pushNotificationsService = overrides.pushNotificationsService ?? { send: vi.fn().mockResolvedValue([]) };
  const scheduler = new EventReminderSchedulerService(supabase as never, notificationsService as never, pushNotificationsService as never);
  return { scheduler, notificationsService, pushNotificationsService };
}

describe('EventReminderSchedulerService', () => {
  it('reminds every participant of an upcoming event that has not been reminded yet', async () => {
    const { scheduler, notificationsService, pushNotificationsService } = buildScheduler({
      events: createQueryChain({ data: [UPCOMING_EVENT], error: null }),
      event_participants: createQueryChain({ data: [{ user_id: 'user-1' }, { user_id: 'user-2' }], error: null }),
      notifications: createQueryChain({ data: null, error: null }),
    });

    await scheduler.checkUpcomingEvents();

    expect(notificationsService.create).toHaveBeenCalledWith('user-1', 'EVENT_REMINDER', {
      eventId: 'event-1',
      title: 'Veillée mondiale',
    });
    expect(notificationsService.create).toHaveBeenCalledWith('user-2', 'EVENT_REMINDER', expect.anything());
    expect(pushNotificationsService.send).toHaveBeenCalledTimes(2);
  });

  it('only queries events scheduled within the next hour that are SCHEDULED or OPEN', async () => {
    const eventsChain = createQueryChain({ data: [], error: null });
    const { scheduler } = buildScheduler({ events: eventsChain });

    await scheduler.checkUpcomingEvents();

    expect(eventsChain.in).toHaveBeenCalledWith('status', ['SCHEDULED', 'OPEN']);
  });

  it('does not remind a participant twice for the same event', async () => {
    const { scheduler, notificationsService } = buildScheduler({
      events: createQueryChain({ data: [UPCOMING_EVENT], error: null }),
      event_participants: createQueryChain({ data: [{ user_id: 'user-1' }], error: null }),
      notifications: createQueryChain({ data: { id: 'notif-1' }, error: null }),
    });

    await scheduler.checkUpcomingEvents();

    expect(notificationsService.create).not.toHaveBeenCalled();
  });

  it('never throws when the upcoming-events lookup itself fails', async () => {
    const { scheduler } = buildScheduler({
      events: createQueryChain({ data: null, error: { message: 'db down' } }),
    });

    await expect(scheduler.checkUpcomingEvents()).resolves.toBeUndefined();
  });

  it('still reminds the other participant when notifying one of them fails', async () => {
    const { scheduler, notificationsService } = buildScheduler(
      {
        events: createQueryChain({ data: [UPCOMING_EVENT], error: null }),
        event_participants: createQueryChain({ data: [{ user_id: 'user-1' }, { user_id: 'user-2' }], error: null }),
        notifications: createQueryChain({ data: null, error: null }),
      },
      {
        notificationsService: {
          create: vi.fn((userId: string) => (userId === 'user-1' ? Promise.reject(new Error('boom')) : Promise.resolve(undefined))),
        },
      },
    );

    await scheduler.checkUpcomingEvents();

    expect(notificationsService.create).toHaveBeenCalledWith('user-2', 'EVENT_REMINDER', expect.anything());
  });
});
