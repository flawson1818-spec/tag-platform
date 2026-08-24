import { NotificationsService } from './notifications.service';
import { createQueryChain, createSupabaseServiceMock } from '../testing/supabase-query-mock';

describe('NotificationsService', () => {
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
