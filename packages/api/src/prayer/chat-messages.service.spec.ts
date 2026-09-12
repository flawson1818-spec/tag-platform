import { ChatMessagesService } from './chat-messages.service';
import { createQueryChain, createSupabaseServiceMock } from '../testing/supabase-query-mock';

describe('ChatMessagesService', () => {
  describe('send', () => {
    it('maps the joined author to author_display_name and drops the nested author object', async () => {
      const chain = createQueryChain({
        data: { id: 'msg-1', community_id: null, author_id: 'user-1', content: 'Amen', status: 'VISIBLE', created_at: '2026-01-01T00:00:00.000Z', author: { display_name: 'Believer' } },
        error: null,
      });
      const supabase = createSupabaseServiceMock({ chat_messages: chain });
      const service = new ChatMessagesService(supabase as never);

      const result = await service.send(null, 'user-1', 'Amen');

      expect(result.author_display_name).toBe('Believer');
      expect((result as unknown as { author?: unknown }).author).toBeUndefined();
    });

    it('defaults author_display_name to null when the author has no joined row', async () => {
      const chain = createQueryChain({
        data: { id: 'msg-1', community_id: null, author_id: 'user-1', content: 'Amen', status: 'VISIBLE', created_at: '2026-01-01T00:00:00.000Z', author: null },
        error: null,
      });
      const supabase = createSupabaseServiceMock({ chat_messages: chain });
      const service = new ChatMessagesService(supabase as never);

      const result = await service.send('community-1', 'user-1', 'Amen');

      expect(result.author_display_name).toBeNull();
    });
  });

  describe('listRecent', () => {
    it('scopes to the world room (community_id IS NULL) when no community is given', async () => {
      const chain = createQueryChain({ data: [], error: null });
      const supabase = createSupabaseServiceMock({ chat_messages: chain });
      const service = new ChatMessagesService(supabase as never);

      await service.listRecent(null);

      expect(chain.is).toHaveBeenCalledWith('community_id', null);
    });

    it('scopes to a specific community when given', async () => {
      const chain = createQueryChain({ data: [], error: null });
      const supabase = createSupabaseServiceMock({ chat_messages: chain });
      const service = new ChatMessagesService(supabase as never);

      await service.listRecent('community-1');

      expect(chain.eq).toHaveBeenCalledWith('community_id', 'community-1');
    });

    it('returns messages oldest-first even though the query fetches newest-first for the LIMIT', async () => {
      const rows = [
        { id: 'msg-3', community_id: null, author_id: 'u', content: 'third', status: 'VISIBLE', created_at: '2026-01-03T00:00:00.000Z', author: null },
        { id: 'msg-2', community_id: null, author_id: 'u', content: 'second', status: 'VISIBLE', created_at: '2026-01-02T00:00:00.000Z', author: null },
        { id: 'msg-1', community_id: null, author_id: 'u', content: 'first', status: 'VISIBLE', created_at: '2026-01-01T00:00:00.000Z', author: null },
      ];
      const chain = createQueryChain({ data: rows, error: null });
      const supabase = createSupabaseServiceMock({ chat_messages: chain });
      const service = new ChatMessagesService(supabase as never);

      const result = await service.listRecent(null);

      expect(result.map((m) => m.id)).toEqual(['msg-1', 'msg-2', 'msg-3']);
      expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false });
    });
  });

  describe('hide', () => {
    it('sets status HIDDEN and stamps deleted_at, keeping the row (soft hide, not a hard delete)', async () => {
      const chain = createQueryChain({ data: null, error: null });
      const supabase = createSupabaseServiceMock({ chat_messages: chain });
      const service = new ChatMessagesService(supabase as never);

      await service.hide('msg-1');

      expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'HIDDEN', deleted_at: expect.any(String) }));
      expect(chain.eq).toHaveBeenCalledWith('id', 'msg-1');
    });
  });

  describe('flag', () => {
    it('records the IA Modératrice classification on the message', async () => {
      const chain = createQueryChain({ data: null, error: null });
      const supabase = createSupabaseServiceMock({ chat_messages: chain });
      const service = new ChatMessagesService(supabase as never);

      await service.flag('msg-1', 'Langage injurieux', 0.87);

      expect(chain.update).toHaveBeenCalledWith({ ai_flagged: true, ai_flag_reason: 'Langage injurieux', ai_flag_confidence: 0.87 });
    });
  });

  describe('countRecentFlagged', () => {
    it('counts flagged messages by that author since the given timestamp, scoped to the room', async () => {
      const chain = createQueryChain({ data: null, error: null, count: 3 });
      const supabase = createSupabaseServiceMock({ chat_messages: chain });
      const service = new ChatMessagesService(supabase as never);

      const result = await service.countRecentFlagged('user-1', 'community-1', '2026-01-01T00:00:00.000Z');

      expect(result).toBe(3);
      expect(chain.eq).toHaveBeenCalledWith('author_id', 'user-1');
      expect(chain.eq).toHaveBeenCalledWith('ai_flagged', true);
      expect(chain.eq).toHaveBeenCalledWith('community_id', 'community-1');
      expect(chain.gte).toHaveBeenCalledWith('created_at', '2026-01-01T00:00:00.000Z');
    });

    it('returns 0 when the count comes back null', async () => {
      const chain = createQueryChain({ data: null, error: null, count: null });
      const supabase = createSupabaseServiceMock({ chat_messages: chain });
      const service = new ChatMessagesService(supabase as never);

      const result = await service.countRecentFlagged('user-1', null, '2026-01-01T00:00:00.000Z');

      expect(result).toBe(0);
      expect(chain.is).toHaveBeenCalledWith('community_id', null);
    });
  });
});
