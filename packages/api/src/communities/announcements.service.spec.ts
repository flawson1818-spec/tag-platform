import { AnnouncementsService } from './announcements.service';
import { createQueryChain, createSupabaseServiceMock } from '../testing/supabase-query-mock';

function buildService(chain: ReturnType<typeof createQueryChain>) {
  const supabase = createSupabaseServiceMock({ community_announcements: chain });
  return new AnnouncementsService(supabase as never);
}

const ANNOUNCEMENT = {
  id: 'ann-1',
  community_id: 'community-1',
  author_id: 'pastor-1',
  content: 'Réunion vendredi 19h',
  pinned_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

describe('AnnouncementsService', () => {
  describe('create', () => {
    it('creates a community-scoped announcement', async () => {
      const chain = createQueryChain({ data: ANNOUNCEMENT, error: null });
      const service = buildService(chain);

      const result = await service.create('community-1', 'pastor-1', 'Réunion vendredi 19h');

      expect(chain.insert).toHaveBeenCalledWith({
        community_id: 'community-1',
        author_id: 'pastor-1',
        content: 'Réunion vendredi 19h',
      });
      expect(result).toEqual(ANNOUNCEMENT);
    });

    it('creates a nation-wide announcement with a null community_id', async () => {
      const chain = createQueryChain({ data: { ...ANNOUNCEMENT, community_id: null }, error: null });
      const service = buildService(chain);

      await service.create(null, 'pastor-1', 'Message national');

      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ community_id: null }),
      );
    });
  });

  describe('list', () => {
    it('scopes to nation-wide only when no community is given', async () => {
      const chain = createQueryChain({ data: [], error: null });
      const service = buildService(chain);

      await service.list(null, { page: 1, limit: 20 });

      expect(chain.is).toHaveBeenCalledWith('community_id', null);
    });

    it('unions a community\'s own announcements with nation-wide ones when a community is given', async () => {
      const chain = createQueryChain({ data: [], error: null });
      const service = buildService(chain);

      await service.list('community-1', { page: 1, limit: 20 });

      expect(chain.or).toHaveBeenCalledWith('community_id.eq.community-1,community_id.is.null');
    });

    it('orders pinned announcements first, then most recent', async () => {
      const chain = createQueryChain({ data: [], error: null });
      const service = buildService(chain);

      await service.list(null, { page: 1, limit: 20 });

      expect(chain.order).toHaveBeenCalledWith('pinned_at', { ascending: false, nullsFirst: false });
      expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false });
    });
  });

  describe('findById', () => {
    it('throws when the announcement does not exist', async () => {
      const chain = createQueryChain({ data: null, error: null });
      const service = buildService(chain);

      await expect(service.findById('missing')).rejects.toThrow('not found');
    });
  });

  describe('setPinned', () => {
    it('sets pinned_at when pinning', async () => {
      const chain = createQueryChain({ data: ANNOUNCEMENT, error: null });
      const service = buildService(chain);

      await service.setPinned('ann-1', true);

      expect(chain.update).toHaveBeenCalledWith({ pinned_at: expect.any(String) });
    });

    it('clears pinned_at when unpinning', async () => {
      const chain = createQueryChain({ data: ANNOUNCEMENT, error: null });
      const service = buildService(chain);

      await service.setPinned('ann-1', false);

      expect(chain.update).toHaveBeenCalledWith({ pinned_at: null });
    });
  });

  describe('remove', () => {
    it('soft-deletes the announcement', async () => {
      const chain = createQueryChain({ data: ANNOUNCEMENT, error: null });
      const service = buildService(chain);

      await service.remove('ann-1');

      expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({ deleted_at: expect.any(String) }));
    });
  });
});
