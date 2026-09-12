import { FaithPathService } from './faith-path.service';
import { createQueryChain, createSupabaseServiceMock } from '../testing/supabase-query-mock';

function buildService(chain: ReturnType<typeof createQueryChain>) {
  const supabase = createSupabaseServiceMock({ faith_path_progress: chain });
  return new FaithPathService(supabase as never);
}

describe('FaithPathService', () => {
  describe('get', () => {
    it('returns the step-0/no-level default when no row exists yet', async () => {
      const chain = createQueryChain({ data: null, error: null });
      const service = buildService(chain);

      const result = await service.get('user-1');

      expect(result.current_step).toBe('DECOUVERTE');
      expect(result.declared_level).toBeNull();
    });

    it('returns the stored progress when a row exists', async () => {
      const chain = createQueryChain({
        data: { current_step: 'EVANGILE', declared_level: 'CONNAIT_DEJA', updated_at: '2026-01-01T00:00:00.000Z' },
        error: null,
      });
      const service = buildService(chain);

      const result = await service.get('user-1');

      expect(result.current_step).toBe('EVANGILE');
      expect(result.declared_level).toBe('CONNAIT_DEJA');
    });
  });

  describe('setLevel', () => {
    it('upserts the declared level without changing the current step', async () => {
      const chain = createQueryChain({
        data: { current_step: 'QUI_EST_JESUS', declared_level: null, updated_at: '2026-01-01T00:00:00.000Z' },
        error: null,
      });
      const service = buildService(chain);

      const result = await service.setLevel('user-1', 'NOUVEAU');

      expect(chain.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: 'user-1', current_step: 'QUI_EST_JESUS', declared_level: 'NOUVEAU' }),
        { onConflict: 'user_id' },
      );
      expect(result.declared_level).toBe('NOUVEAU');
    });
  });

  describe('advance', () => {
    it('moves to the next step from the default', async () => {
      const chain = createQueryChain({ data: null, error: null });
      const service = buildService(chain);

      const result = await service.advance('user-1');

      expect(result.current_step).toBe('QUI_EST_JESUS');
      expect(chain.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ current_step: 'QUI_EST_JESUS' }),
        { onConflict: 'user_id' },
      );
    });

    it('never advances past the last step', async () => {
      const chain = createQueryChain({
        data: { current_step: 'COMMUNAUTE', declared_level: null, updated_at: '2026-01-01T00:00:00.000Z' },
        error: null,
      });
      const service = buildService(chain);

      const result = await service.advance('user-1');

      expect(result.current_step).toBe('COMMUNAUTE');
    });

    it('preserves the declared level while advancing', async () => {
      const chain = createQueryChain({
        data: { current_step: 'DECOUVERTE', declared_level: 'CONNAIT_DEJA', updated_at: '2026-01-01T00:00:00.000Z' },
        error: null,
      });
      const service = buildService(chain);

      await service.advance('user-1');

      expect(chain.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ declared_level: 'CONNAIT_DEJA' }),
        { onConflict: 'user_id' },
      );
    });
  });
});
