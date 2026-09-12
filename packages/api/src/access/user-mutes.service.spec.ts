import { UserMutesService } from './user-mutes.service';
import { createQueryChain, createSupabaseServiceMock } from '../testing/supabase-query-mock';

function buildService(chain: ReturnType<typeof createQueryChain>) {
  const supabase = createSupabaseServiceMock({ user_mutes: chain });
  return new UserMutesService(supabase as never);
}

describe('UserMutesService', () => {
  describe('activeMuteUntil', () => {
    it('returns null when no active mute row exists', async () => {
      const chain = createQueryChain({ data: null, error: null });
      const service = buildService(chain);

      const result = await service.activeMuteUntil('user-1', null);

      expect(result).toBeNull();
      expect(chain.is).toHaveBeenCalledWith('community_id', null);
    });

    it('returns the muted_until timestamp when an active mute exists', async () => {
      const chain = createQueryChain({ data: { muted_until: '2026-01-01T00:15:00.000Z' }, error: null });
      const service = buildService(chain);

      const result = await service.activeMuteUntil('user-1', 'community-1');

      expect(result).toBe('2026-01-01T00:15:00.000Z');
      expect(chain.eq).toHaveBeenCalledWith('community_id', 'community-1');
    });
  });

  describe('mute', () => {
    it('inserts a mute row and returns its expiry', async () => {
      const chain = createQueryChain({ data: null, error: null });
      const service = buildService(chain);

      const mutedUntil = await service.mute('user-1', 'community-1', 15, 'moderator-1', 'spam répété');

      expect(new Date(mutedUntil).getTime()).toBeGreaterThan(Date.now());
      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-1',
          community_id: 'community-1',
          muted_by: 'moderator-1',
          reason: 'spam répété',
        }),
      );
    });

    it('accepts a null mutedBy for an autonomous IA Modératrice mute', async () => {
      const chain = createQueryChain({ data: null, error: null });
      const service = buildService(chain);

      await service.mute('user-1', null, 15, null, 'Signalements répétés');

      expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({ muted_by: null, community_id: null }));
    });
  });

  describe('unmute', () => {
    it('deletes only the active mute rows for that user/scope', async () => {
      const chain = createQueryChain({ data: null, error: null });
      const service = buildService(chain);

      await service.unmute('user-1', 'community-1');

      expect(chain.delete).toHaveBeenCalled();
      expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1');
      expect(chain.eq).toHaveBeenCalledWith('community_id', 'community-1');
    });
  });
});
