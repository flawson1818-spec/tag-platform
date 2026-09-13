import { PrayerCategoryFollowsService } from './prayer-category-follows.service';
import { createQueryChain, createSupabaseServiceMock } from '../testing/supabase-query-mock';

function buildService(chain: ReturnType<typeof createQueryChain> | ReturnType<typeof createQueryChain>[]) {
  const supabase = createSupabaseServiceMock({ prayer_category_follows: chain });
  return new PrayerCategoryFollowsService(supabase as never);
}

const FOLLOW = { id: 'follow-1', user_id: 'user-1', category: 'Santé', created_at: '2026-01-01T00:00:00.000Z' };

describe('PrayerCategoryFollowsService', () => {
  describe('follow', () => {
    it('creates a new follow row', async () => {
      const chain = createQueryChain({ data: FOLLOW, error: null });
      const service = buildService(chain);

      const result = await service.follow('user-1', 'Santé');

      expect(chain.upsert).toHaveBeenCalledWith(
        { user_id: 'user-1', category: 'Santé' },
        { onConflict: 'user_id,category', ignoreDuplicates: true },
      );
      expect(result).toEqual(FOLLOW);
    });

    it('returns the existing row when already following (upsert with ignoreDuplicates returns nothing)', async () => {
      const chains = [
        createQueryChain({ data: null, error: null }), // upsert — conflict, nothing returned
        createQueryChain({ data: FOLLOW, error: null }), // fallback fetch of the existing row
      ];
      const service = buildService(chains);

      const result = await service.follow('user-1', 'Santé');

      expect(result).toEqual(FOLLOW);
    });
  });

  describe('unfollow', () => {
    it('deletes the follow row for that user and category', async () => {
      const chain = createQueryChain({ data: null, error: null });
      const service = buildService(chain);

      await service.unfollow('user-1', 'Santé');

      expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1');
      expect(chain.eq).toHaveBeenCalledWith('category', 'Santé');
    });
  });

  describe('listForUser', () => {
    it('scopes to the given user', async () => {
      const chain = createQueryChain({ data: [FOLLOW], error: null });
      const service = buildService(chain);

      const result = await service.listForUser('user-1');

      expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1');
      expect(result).toEqual([FOLLOW]);
    });
  });

  describe('listFollowerIds', () => {
    it('returns every user_id following the given category', async () => {
      const chain = createQueryChain({ data: [{ user_id: 'user-1' }, { user_id: 'user-2' }], error: null });
      const service = buildService(chain);

      const result = await service.listFollowerIds('Santé');

      expect(chain.eq).toHaveBeenCalledWith('category', 'Santé');
      expect(result).toEqual(['user-1', 'user-2']);
    });
  });
});
