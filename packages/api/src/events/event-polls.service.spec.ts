import { EventPollsService } from './event-polls.service';
import { createQueryChain, createSupabaseServiceMock } from '../testing/supabase-query-mock';

function buildService(tables: Record<string, ReturnType<typeof createQueryChain>>) {
  const supabase = createSupabaseServiceMock(tables);
  return new EventPollsService(supabase as never);
}

const POLL = {
  id: 'poll-1',
  event_id: 'event-1',
  question: 'Quel thème pour la prochaine veillée ?',
  options: ['Louange', 'Intercession', 'Étude'],
  closed_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
};

describe('EventPollsService', () => {
  describe('create', () => {
    it('inserts the poll with the given question and options', async () => {
      const pollsChain = createQueryChain({ data: POLL, error: null });
      const service = buildService({ event_polls: pollsChain });

      const result = await service.create('event-1', 'moderator-1', { question: POLL.question, options: POLL.options });

      expect(result).toEqual(POLL);
      expect(pollsChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ event_id: 'event-1', question: POLL.question, options: POLL.options, created_by: 'moderator-1' }),
      );
    });
  });

  describe('list', () => {
    it('returns every poll for the event with vote counts and the caller\'s own vote', async () => {
      const service = buildService({
        event_polls: createQueryChain({ data: [POLL], error: null }),
        event_poll_votes: createQueryChain({
          data: [
            { option_index: 0, user_id: 'user-1' },
            { option_index: 0, user_id: 'user-2' },
            { option_index: 1, user_id: 'user-3' },
          ],
          error: null,
        }),
      });

      const [result] = await service.list('event-1', 'user-2');

      expect(result.vote_counts).toEqual([2, 1, 0]);
      expect(result.total_votes).toBe(3);
      expect(result.my_vote).toBe(0);
    });

    it('returns null for my_vote when no userId is given (anonymous read)', async () => {
      const service = buildService({
        event_polls: createQueryChain({ data: [POLL], error: null }),
        event_poll_votes: createQueryChain({ data: [{ option_index: 0, user_id: 'user-1' }], error: null }),
      });

      const [result] = await service.list('event-1', null);

      expect(result.my_vote).toBeNull();
    });
  });

  describe('vote', () => {
    it('records the vote and returns the updated results', async () => {
      const votesChain = createQueryChain({ data: [{ option_index: 1, user_id: 'user-1' }], error: null });
      const service = buildService({
        event_polls: createQueryChain({ data: POLL, error: null }),
        event_poll_votes: votesChain,
      });

      const result = await service.vote('poll-1', 'user-1', 1);

      expect(votesChain.upsert).toHaveBeenCalledWith(
        { poll_id: 'poll-1', user_id: 'user-1', option_index: 1 },
        { onConflict: 'poll_id,user_id' },
      );
      expect(result.my_vote).toBe(1);
    });

    it('rejects a vote on an out-of-range option', async () => {
      const service = buildService({
        event_polls: createQueryChain({ data: POLL, error: null }),
        event_poll_votes: createQueryChain({ data: [], error: null }),
      });

      await expect(service.vote('poll-1', 'user-1', 99)).rejects.toThrow();
    });

    it('rejects a vote on a closed poll', async () => {
      const service = buildService({
        event_polls: createQueryChain({ data: { ...POLL, closed_at: '2026-01-01T01:00:00.000Z' }, error: null }),
        event_poll_votes: createQueryChain({ data: [], error: null }),
      });

      await expect(service.vote('poll-1', 'user-1', 0)).rejects.toThrow();
    });
  });

  describe('close', () => {
    it('sets closed_at and returns the final results', async () => {
      const pollsChain = createQueryChain({ data: { ...POLL, closed_at: '2026-01-01T02:00:00.000Z' }, error: null });
      const service = buildService({
        event_polls: pollsChain,
        event_poll_votes: createQueryChain({ data: [], error: null }),
      });

      const result = await service.close('poll-1', 'moderator-1');

      expect(pollsChain.update).toHaveBeenCalledWith(expect.objectContaining({ closed_at: expect.any(String) }));
      expect(result.closed_at).not.toBeNull();
    });

    it('throws when the poll does not exist', async () => {
      const service = buildService({
        event_polls: createQueryChain({ data: null, error: null }),
        event_poll_votes: createQueryChain({ data: [], error: null }),
      });

      await expect(service.close('poll-missing', 'moderator-1')).rejects.toThrow();
    });
  });
});
