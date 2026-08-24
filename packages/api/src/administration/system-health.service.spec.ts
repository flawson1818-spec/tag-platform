import { SystemHealthService } from './system-health.service';
import { createQueryChain, createSupabaseServiceMock } from '../testing/supabase-query-mock';

describe('SystemHealthService', () => {
  it('reports OK with database connected when the query succeeds', async () => {
    const supabase = createSupabaseServiceMock({ roles: createQueryChain({ data: [{ id: 'role-1' }], error: null }) });
    const service = new SystemHealthService(supabase as never);

    const result = await service.check();

    expect(result.status).toBe('OK');
    expect(result.database.connected).toBe(true);
    expect(typeof result.database.latencyMs).toBe('number');
    expect(typeof result.checkedAt).toBe('string');
  });

  it('reports DEGRADED with database disconnected when the query errors', async () => {
    const supabase = createSupabaseServiceMock({
      roles: createQueryChain({ data: null, error: { message: 'connection refused' } }),
    });
    const service = new SystemHealthService(supabase as never);

    const result = await service.check();

    expect(result.status).toBe('DEGRADED');
    expect(result.database.connected).toBe(false);
  });
});
