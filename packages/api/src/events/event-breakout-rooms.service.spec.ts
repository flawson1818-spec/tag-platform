import { EventBreakoutRoomsService } from './event-breakout-rooms.service';
import { CreateBreakoutRoomsDto } from './dto/create-breakout-rooms.dto';
import { createQueryChain, createSupabaseServiceMock } from '../testing/supabase-query-mock';

function buildService(tables: Record<string, ReturnType<typeof createQueryChain>>) {
  const supabase = createSupabaseServiceMock(tables);
  return new EventBreakoutRoomsService(supabase as never);
}

const ROOM_A = { id: 'room-a', event_id: 'event-1', label: 'Salle 1', capacity: null, created_at: '2026-01-01T00:00:00.000Z' };
const ROOM_B = { id: 'room-b', event_id: 'event-1', label: 'Salle 2', capacity: null, created_at: '2026-01-01T00:00:01.000Z' };

describe('EventBreakoutRoomsService', () => {
  describe('create', () => {
    it('creates the requested number of rooms and round-robins current participants across them', async () => {
      const roomsChain = createQueryChain({ data: [ROOM_A, ROOM_B], error: null });
      const participantsChain = createQueryChain({
        data: [{ user_id: 'user-1' }, { user_id: 'user-2' }, { user_id: 'user-3' }],
        error: null,
      });
      const assignmentsChain = createQueryChain({
        data: [
          { room_id: 'room-a', user_id: 'user-1' },
          { room_id: 'room-b', user_id: 'user-2' },
          { room_id: 'room-a', user_id: 'user-3' },
        ],
        error: null,
      });
      const service = buildService({
        event_breakout_rooms: roomsChain,
        event_participants: participantsChain,
        event_breakout_assignments: assignmentsChain,
      });
      const dto: CreateBreakoutRoomsDto = { roomCount: 2 };

      const result = await service.create('event-1', dto);

      expect(assignmentsChain.upsert).toHaveBeenCalledWith(
        [
          { event_id: 'event-1', room_id: 'room-a', user_id: 'user-1' },
          { event_id: 'event-1', room_id: 'room-b', user_id: 'user-2' },
          { event_id: 'event-1', room_id: 'room-a', user_id: 'user-3' },
        ],
        { onConflict: 'event_id,user_id' },
      );
      expect(result).toEqual([
        { ...ROOM_A, occupant_count: 2 },
        { ...ROOM_B, occupant_count: 1 },
      ]);
    });

    it('uses default labels when none are given, and custom ones when provided', async () => {
      const roomsChain = createQueryChain({ data: [ROOM_A], error: null });
      const service = buildService({
        event_breakout_rooms: roomsChain,
        event_participants: createQueryChain({ data: [], error: null }),
        event_breakout_assignments: createQueryChain({ data: [], error: null }),
      });

      await service.create('event-1', { roomCount: 1, labels: ['Intercession'] });

      expect(roomsChain.insert).toHaveBeenCalledWith([
        { event_id: 'event-1', label: 'Intercession', capacity: null },
      ]);
    });

    it('does not attempt any assignment upsert when the event has no participants yet', async () => {
      const assignmentsChain = createQueryChain({ data: [], error: null });
      const service = buildService({
        event_breakout_rooms: createQueryChain({ data: [ROOM_A], error: null }),
        event_participants: createQueryChain({ data: [], error: null }),
        event_breakout_assignments: assignmentsChain,
      });

      await service.create('event-1', { roomCount: 1 });

      expect(assignmentsChain.upsert).not.toHaveBeenCalled();
    });
  });

  describe('join', () => {
    it('assigns the requested room when it has capacity left', async () => {
      const assignmentsChain = createQueryChain({ data: [], error: null });
      const service = buildService({
        event_breakout_rooms: createQueryChain({ data: [{ ...ROOM_A, capacity: 5 }, ROOM_B], error: null }),
        event_breakout_assignments: assignmentsChain,
      });

      const result = await service.join('event-1', 'user-1', 'room-a');

      expect(result).toEqual({ roomId: 'room-a', redirected: false });
      expect(assignmentsChain.upsert).toHaveBeenCalledWith(
        { event_id: 'event-1', room_id: 'room-a', user_id: 'user-1' },
        { onConflict: 'event_id,user_id' },
      );
    });

    it('redirects to the least-loaded room instead of blocking when the requested one is full', async () => {
      const assignmentsChain = createQueryChain({
        data: [
          { room_id: 'room-a', user_id: 'user-1' },
          { room_id: 'room-a', user_id: 'user-2' },
          { room_id: 'room-b', user_id: 'user-3' },
        ],
        error: null,
      });
      const service = buildService({
        event_breakout_rooms: createQueryChain({ data: [{ ...ROOM_A, capacity: 2 }, { ...ROOM_B, capacity: 5 }], error: null }),
        event_breakout_assignments: assignmentsChain,
      });

      const result = await service.join('event-1', 'user-4', 'room-a');

      expect(result).toEqual({ roomId: 'room-b', redirected: true });
    });

    it('throws when the requested room does not belong to this event', async () => {
      const service = buildService({
        event_breakout_rooms: createQueryChain({ data: [ROOM_A], error: null }),
        event_breakout_assignments: createQueryChain({ data: [], error: null }),
      });

      await expect(service.join('event-1', 'user-1', 'room-nonexistent')).rejects.toThrow();
    });
  });

  describe('leave', () => {
    it('deletes the assignment for that user in that event', async () => {
      const assignmentsChain = createQueryChain({ data: null, error: null });
      const service = buildService({ event_breakout_assignments: assignmentsChain });

      await service.leave('event-1', 'user-1');

      expect(assignmentsChain.delete).toHaveBeenCalled();
      expect(assignmentsChain.eq).toHaveBeenCalledWith('event_id', 'event-1');
      expect(assignmentsChain.eq).toHaveBeenCalledWith('user_id', 'user-1');
    });
  });

  describe('myAssignment', () => {
    it('returns null when the user has no current assignment', async () => {
      const service = buildService({ event_breakout_assignments: createQueryChain({ data: null, error: null }) });

      const result = await service.myAssignment('event-1', 'user-1');

      expect(result).toBeNull();
    });

    it('returns the assigned room id', async () => {
      const service = buildService({
        event_breakout_assignments: createQueryChain({ data: { room_id: 'room-a' }, error: null }),
      });

      const result = await service.myAssignment('event-1', 'user-1');

      expect(result).toBe('room-a');
    });
  });
});
