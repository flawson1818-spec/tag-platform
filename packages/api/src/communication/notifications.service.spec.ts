import { NotificationsService } from './notifications.service';
import { createQueryChain, createSupabaseServiceMock } from '../testing/supabase-query-mock';

describe('NotificationsService', () => {
  describe('create — respects per-type preferences', () => {
    it('creates the notification when the type has no explicit preference (enabled by default)', async () => {
      const notifChain = createQueryChain({
        data: { id: 'notif-1', user_id: 'user-1', type: 'TESTIMONY_PUBLISHED', payload: {}, status: 'DELIVERED', read_at: null, created_at: '2026-01-01T00:00:00.000Z' },
        error: null,
      });
      const supabase = createSupabaseServiceMock({
        users: createQueryChain({ data: { notification_prefs: {} }, error: null }),
        notifications: notifChain,
      });
      const service = new NotificationsService(supabase as never);

      const result = await service.create('user-1', 'TESTIMONY_PUBLISHED', {});

      expect(result).not.toBeNull();
      expect(notifChain.insert).toHaveBeenCalled();
    });

    it('skips creating the notification when the user explicitly disabled that type', async () => {
      const notifChain = createQueryChain({ data: null, error: null });
      const supabase = createSupabaseServiceMock({
        users: createQueryChain({ data: { notification_prefs: { TESTIMONY_PUBLISHED: false } }, error: null }),
        notifications: notifChain,
      });
      const service = new NotificationsService(supabase as never);

      const result = await service.create('user-1', 'TESTIMONY_PUBLISHED', {});

      expect(result).toBeNull();
      expect(notifChain.insert).not.toHaveBeenCalled();
    });

    it('fails open (creates the notification) when the preference lookup errors', async () => {
      const notifChain = createQueryChain({
        data: { id: 'notif-1', user_id: 'user-1', type: 'TESTIMONY_PUBLISHED', payload: {}, status: 'DELIVERED', read_at: null, created_at: '2026-01-01T00:00:00.000Z' },
        error: null,
      });
      const supabase = createSupabaseServiceMock({
        users: createQueryChain({ data: null, error: { message: 'db down' } }),
        notifications: notifChain,
      });
      const service = new NotificationsService(supabase as never);

      const result = await service.create('user-1', 'TESTIMONY_PUBLISHED', {});

      expect(result).not.toBeNull();
    });
  });

  describe('getPreferences', () => {
    it('reports every known type as enabled when no preferences have been set', async () => {
      const supabase = createSupabaseServiceMock({
        users: createQueryChain({ data: { notification_prefs: {} }, error: null }),
      });
      const service = new NotificationsService(supabase as never);

      const result = await service.getPreferences('user-1');

      expect(result).toEqual([
        { type: 'TESTIMONY_PUBLISHED', enabled: true },
        { type: 'TESTIMONY_REJECTED', enabled: true },
        { type: 'PRAYER_REQUEST_ANSWERED', enabled: true },
        { type: 'PRAYER_REMINDER', enabled: true },
      ]);
    });

    it('reflects an explicitly disabled type', async () => {
      const supabase = createSupabaseServiceMock({
        users: createQueryChain({ data: { notification_prefs: { TESTIMONY_REJECTED: false } }, error: null }),
      });
      const service = new NotificationsService(supabase as never);

      const result = await service.getPreferences('user-1');

      expect(result.find((p) => p.type === 'TESTIMONY_REJECTED')).toEqual({ type: 'TESTIMONY_REJECTED', enabled: false });
    });
  });

  describe('setPreference', () => {
    it('merges the new value in without clobbering other existing preferences', async () => {
      const chains = [
        createQueryChain({ data: { notification_prefs: { TESTIMONY_PUBLISHED: false } }, error: null }), // select
        createQueryChain({ data: null, error: null }), // update
      ];
      const supabase = createSupabaseServiceMock({ users: chains });
      const service = new NotificationsService(supabase as never);

      const result = await service.setPreference('user-1', 'TESTIMONY_REJECTED', false);

      expect(chains[1].update).toHaveBeenCalledWith({
        notification_prefs: { TESTIMONY_PUBLISHED: false, TESTIMONY_REJECTED: false },
      });
      expect(result).toEqual([
        { type: 'TESTIMONY_PUBLISHED', enabled: false },
        { type: 'TESTIMONY_REJECTED', enabled: false },
        { type: 'PRAYER_REQUEST_ANSWERED', enabled: true },
        { type: 'PRAYER_REMINDER', enabled: true },
      ]);
    });

    it('rejects an unknown notification type', async () => {
      const supabase = createSupabaseServiceMock({ users: createQueryChain({ data: {}, error: null }) });
      const service = new NotificationsService(supabase as never);

      await expect(service.setPreference('user-1', 'NOT_A_REAL_TYPE', false)).rejects.toThrow(
        'Unknown notification type: NOT_A_REAL_TYPE',
      );
    });
  });

  describe('archive', () => {
    it('sets status to ARCHIVED, scoped to the owning user', async () => {
      const chain = createQueryChain({
        data: {
          id: 'notif-1',
          user_id: 'user-1',
          type: 'TESTIMONY_PUBLISHED',
          payload: {},
          status: 'ARCHIVED',
          read_at: null,
          created_at: '2026-01-01T00:00:00.000Z',
        },
        error: null,
      });
      const supabase = createSupabaseServiceMock({ notifications: chain });
      const service = new NotificationsService(supabase as never);

      const result = await service.archive('notif-1', 'user-1');

      expect(chain.update).toHaveBeenCalledWith({ status: 'ARCHIVED' });
      expect(chain.eq).toHaveBeenCalledWith('id', 'notif-1');
      expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1');
      expect(result.status).toBe('ARCHIVED');
    });

    it('throws NotFoundException when the notification does not belong to the user (or does not exist)', async () => {
      const supabase = createSupabaseServiceMock({
        notifications: createQueryChain({ data: null, error: null }),
      });
      const service = new NotificationsService(supabase as never);

      await expect(service.archive('notif-1', 'someone-else')).rejects.toThrow('Notification notif-1 not found');
    });
  });
});
