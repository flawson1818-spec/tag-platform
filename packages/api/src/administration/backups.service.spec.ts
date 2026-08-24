import { BackupsService } from './backups.service';
import { createQueryChain, createSupabaseServiceMock } from '../testing/supabase-query-mock';

describe('BackupsService', () => {
  describe('run', () => {
    it('records the request as COMPLETED immediately (there is no self-hosted pipeline to actually run)', async () => {
      const chain = createQueryChain({
        data: { id: 'backup-1', status: 'COMPLETED', note: 'x', requested_by: 'admin-1', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' },
        error: null,
      });
      const supabase = createSupabaseServiceMock({ backups: chain });
      const service = new BackupsService(supabase as never);

      const result = await service.run('admin-1');

      expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({ status: 'COMPLETED', requested_by: 'admin-1' }));
      expect(result.status).toBe('COMPLETED');
    });
  });

  describe('list', () => {
    it('paginates ordered by most recent first', async () => {
      const chain = createQueryChain({ data: [], error: null, count: 0 });
      const supabase = createSupabaseServiceMock({ backups: chain });
      const service = new BackupsService(supabase as never);

      await service.list({ page: 2, limit: 10 } as never);

      expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(chain.range).toHaveBeenCalledWith(10, 19);
    });
  });
});
