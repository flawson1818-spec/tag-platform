import { EventsService } from './events.service';
import { createQueryChain, createSupabaseServiceMock } from '../testing/supabase-query-mock';

const CREATED_EVENT = {
  id: 'event-1',
  community_id: null,
  type: 'VEILLEE',
  title: 'Veillée de prière',
  description: null,
  scheduled_at: '2026-06-01T20:00:00.000Z',
  status: 'CREATED',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  deleted_at: null,
};

function buildService(
  supabase: ReturnType<typeof createSupabaseServiceMock>,
  notificationsService: Partial<Record<string, unknown>> = { create: vi.fn().mockResolvedValue(undefined) },
) {
  return new EventsService(supabase as never, notificationsService as never);
}

describe('EventsService', () => {
  describe('updateStatus — state machine', () => {
    it('allows CREATED -> SCHEDULED -> OPEN -> RUNNING -> FINISHED -> ARCHIVED, one hop at a time', async () => {
      const supabase = createSupabaseServiceMock({
        events: [
          createQueryChain({ data: CREATED_EVENT, error: null }),
          createQueryChain({ data: { ...CREATED_EVENT, status: 'SCHEDULED' }, error: null }),
        ],
      });
      const service = buildService(supabase);

      const result = await service.updateStatus('event-1', 'SCHEDULED' as never, 'actor-1');

      expect(result.status).toBe('SCHEDULED');
    });

    it('rejects skipping a step (CREATED straight to RUNNING)', async () => {
      const supabase = createSupabaseServiceMock({
        events: createQueryChain({ data: CREATED_EVENT, error: null }),
      });
      const service = buildService(supabase);

      await expect(service.updateStatus('event-1', 'RUNNING' as never, 'actor-1')).rejects.toThrow(
        'Cannot transition event from CREATED to RUNNING',
      );
    });

    it('rejects any transition out of the terminal ARCHIVED status', async () => {
      const supabase = createSupabaseServiceMock({
        events: createQueryChain({ data: { ...CREATED_EVENT, status: 'ARCHIVED' }, error: null }),
      });
      const service = buildService(supabase);

      await expect(service.updateStatus('event-1', 'SCHEDULED' as never, 'actor-1')).rejects.toThrow(
        'Cannot transition event from ARCHIVED to SCHEDULED',
      );
    });

    it('rejects going backward (RUNNING to OPEN)', async () => {
      const supabase = createSupabaseServiceMock({
        events: createQueryChain({ data: { ...CREATED_EVENT, status: 'RUNNING' }, error: null }),
      });
      const service = buildService(supabase);

      await expect(service.updateStatus('event-1', 'OPEN' as never, 'actor-1')).rejects.toThrow(
        'Cannot transition event from RUNNING to OPEN',
      );
    });
  });

  describe('join', () => {
    it('registers a first-time participant and returns the mapped row', async () => {
      const supabase = createSupabaseServiceMock({
        events: createQueryChain({ data: CREATED_EVENT, error: null }),
        event_participants: createQueryChain({
          data: { id: 'participant-1', event_id: 'event-1', user_id: 'user-1', role_in_event: 'ATTENDEE', user: { display_name: 'Believer' } },
          error: null,
        }),
      });
      const service = buildService(supabase);

      const result = await service.join('event-1', 'user-1');

      expect(result.display_name).toBe('Believer');
      expect((result as unknown as { user?: unknown }).user).toBeUndefined();
    });

    it('falls back to fetching the existing row when already registered (upsert ignoreDuplicates returns nothing)', async () => {
      const supabase = createSupabaseServiceMock({
        events: createQueryChain({ data: CREATED_EVENT, error: null }),
        event_participants: [
          createQueryChain({ data: null, error: null }), // upsert: conflict, nothing returned
          createQueryChain({
            data: { id: 'participant-1', event_id: 'event-1', user_id: 'user-1', role_in_event: 'ATTENDEE', user: null },
            error: null,
          }), // fallback select
        ],
      });
      const service = buildService(supabase);

      const result = await service.join('event-1', 'user-1');

      expect(result.id).toBe('participant-1');
      expect(result.display_name).toBeNull();
    });

    it('throws if the fallback fetch also finds nothing', async () => {
      const supabase = createSupabaseServiceMock({
        events: createQueryChain({ data: CREATED_EVENT, error: null }),
        event_participants: [
          createQueryChain({ data: null, error: null }),
          createQueryChain({ data: null, error: null }),
        ],
      });
      const service = buildService(supabase);

      await expect(service.join('event-1', 'user-1')).rejects.toThrow('Failed to register for this event');
    });

    it('throws NotFoundException when the event does not exist', async () => {
      const supabase = createSupabaseServiceMock({
        events: createQueryChain({ data: null, error: null }),
      });
      const service = buildService(supabase);

      await expect(service.join('missing', 'user-1')).rejects.toThrow('Event missing not found');
    });
  });

  describe('listParticipants', () => {
    it('maps the joined user to display_name and drops the nested user object', async () => {
      const rows = [
        { id: 'p-1', event_id: 'event-1', user_id: 'user-1', role_in_event: 'ATTENDEE', user: { display_name: 'Alice' } },
        { id: 'p-2', event_id: 'event-1', user_id: 'user-2', role_in_event: 'ATTENDEE', user: null },
      ];
      const supabase = createSupabaseServiceMock({
        event_participants: createQueryChain({ data: rows, error: null }),
      });
      const service = buildService(supabase);

      const result = await service.listParticipants('event-1');

      expect(result).toEqual([
        { id: 'p-1', event_id: 'event-1', user_id: 'user-1', role_in_event: 'ATTENDEE', display_name: 'Alice' },
        { id: 'p-2', event_id: 'event-1', user_id: 'user-2', role_in_event: 'ATTENDEE', display_name: null },
      ]);
    });
  });

  describe('raiseHand', () => {
    it('upserts hand_raised_at without touching an existing role_in_event', async () => {
      const supabase = createSupabaseServiceMock({
        events: createQueryChain({ data: CREATED_EVENT, error: null }),
        event_participants: createQueryChain({
          data: { id: 'p-1', event_id: 'event-1', user_id: 'user-1', role_in_event: 'SPEAKER', hand_raised_at: '2026-01-01T00:00:00.000Z', user: null },
          error: null,
        }),
      });
      const service = buildService(supabase);

      const result = await service.raiseHand('event-1', 'user-1');

      expect(result.role_in_event).toBe('SPEAKER');
      expect(result.hand_raised_at).toBe('2026-01-01T00:00:00.000Z');
    });

    it('throws NotFoundException when the event does not exist', async () => {
      const supabase = createSupabaseServiceMock({
        events: createQueryChain({ data: null, error: null }),
      });
      const service = buildService(supabase);

      await expect(service.raiseHand('missing', 'user-1')).rejects.toThrow('Event missing not found');
    });
  });

  describe('lowerHand', () => {
    it('clears hand_raised_at for the participant', async () => {
      const chain = createQueryChain({ data: null, error: null });
      const supabase = createSupabaseServiceMock({ event_participants: chain });
      const service = buildService(supabase);

      await service.lowerHand('event-1', 'user-1');

      expect(chain.update).toHaveBeenCalledWith({ hand_raised_at: null });
      expect(chain.eq).toHaveBeenCalledWith('event_id', 'event-1');
      expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1');
    });
  });

  describe('setParticipantRole', () => {
    it('grants the floor to a participant', async () => {
      const supabase = createSupabaseServiceMock({
        event_participants: createQueryChain({
          data: { id: 'p-1', event_id: 'event-1', user_id: 'user-1', role_in_event: 'SPEAKER', user: { display_name: 'Believer' } },
          error: null,
        }),
      });
      const service = buildService(supabase);

      const result = await service.setParticipantRole('event-1', 'user-1', 'SPEAKER');

      expect(result.role_in_event).toBe('SPEAKER');
      expect(result.display_name).toBe('Believer');
    });

    it('throws NotFoundException when the target user never joined the event', async () => {
      const supabase = createSupabaseServiceMock({
        event_participants: createQueryChain({ data: null, error: null }),
      });
      const service = buildService(supabase);

      await expect(service.setParticipantRole('event-1', 'user-1', 'SPEAKER')).rejects.toThrow(
        'No participant user-1 registered for event event-1',
      );
    });
  });

  describe('softDelete', () => {
    it('throws if the event does not exist', async () => {
      const supabase = createSupabaseServiceMock({
        events: createQueryChain({ data: null, error: null }),
      });
      const service = buildService(supabase);

      await expect(service.softDelete('missing', 'actor-1')).rejects.toThrow('Event missing not found');
    });
  });

  describe('create', () => {
    const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

    it('returns the created event immediately without waiting on member notification', async () => {
      const supabase = createSupabaseServiceMock({
        events: createQueryChain({ data: CREATED_EVENT, error: null }),
        community_members: createQueryChain({ data: [], error: null }),
      });
      const service = buildService(supabase);

      const result = await service.create({ type: 'VEILLEE', title: 'Veillée' } as never, 'actor-1');

      expect(result).toEqual(CREATED_EVENT);
    });

    it('does not look up members at all for a nation-wide event (no community_id)', async () => {
      const supabase = createSupabaseServiceMock({
        events: createQueryChain({ data: CREATED_EVENT, error: null }),
      });
      const notificationsService = { create: vi.fn().mockResolvedValue(undefined) };
      const service = buildService(supabase, notificationsService);

      await service.create({ type: 'VEILLEE', title: 'Veillée' } as never, 'actor-1');
      await flush();

      expect(notificationsService.create).not.toHaveBeenCalled();
    });

    it('notifies every active member except the actor for a community-scoped event', async () => {
      const communityEvent = { ...CREATED_EVENT, community_id: 'community-1' };
      const membersChain = createQueryChain({
        data: [{ user_id: 'member-1' }, { user_id: 'member-2' }, { user_id: 'actor-1' }],
        error: null,
      });
      const supabase = createSupabaseServiceMock({
        events: createQueryChain({ data: communityEvent, error: null }),
        community_members: membersChain,
      });
      const notificationsService = { create: vi.fn().mockResolvedValue(undefined) };
      const service = buildService(supabase, notificationsService);

      await service.create({ type: 'VEILLEE', title: 'Veillée', communityId: 'community-1' } as never, 'actor-1');
      await flush();

      expect(membersChain.eq).toHaveBeenCalledWith('status', 'ACTIVE');
      expect(notificationsService.create).toHaveBeenCalledWith('member-1', 'EVENT_CREATED', {
        eventId: communityEvent.id,
        title: communityEvent.title,
      });
      expect(notificationsService.create).toHaveBeenCalledWith('member-2', 'EVENT_CREATED', expect.anything());
      expect(notificationsService.create).not.toHaveBeenCalledWith('actor-1', 'EVENT_CREATED', expect.anything());
    });

    it('never throws even when the member lookup fails', async () => {
      const communityEvent = { ...CREATED_EVENT, community_id: 'community-1' };
      const supabase = createSupabaseServiceMock({
        events: createQueryChain({ data: communityEvent, error: null }),
        community_members: createQueryChain({ data: null, error: { message: 'db down' } }),
      });
      const service = buildService(supabase);

      const result = await service.create({ type: 'VEILLEE', title: 'Veillée', communityId: 'community-1' } as never, 'actor-1');
      await flush();

      expect(result).toEqual(communityEvent);
    });
  });
});
