import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateBreakoutRoomsDto } from './dto/create-breakout-rooms.dto';
import { EventBreakoutAssignmentResult, EventBreakoutRoom, EventBreakoutRoomWithOccupancy } from './event-breakout-room.entity';

const ROOM_COLUMNS = 'id, event_id, label, capacity, created_at';

interface AssignmentRow {
  room_id: string;
  user_id: string;
}

/**
 * docs/01_FUNCTIONAL_SPECIFICATION.md §7.2 "Répartition en salles de prière (breakout rooms)" /
 * docs/05_API_SPECIFICATION.md section 5 ("POST /events/:id/breakout-rooms — Modérateur+ —
 * répartition") / docs/07_UX_UI_SPECIFICATION.md §7 error case: a full room must never block a
 * participant — redirect to the least-loaded room instead. Two brand-new, isolated tables only
 * touched by this service.
 */
@Injectable()
export class EventBreakoutRoomsService {
  constructor(private readonly supabase: SupabaseService) {}

  private get roomsDb() {
    return this.supabase.client.from('event_breakout_rooms');
  }

  private get assignmentsDb() {
    return this.supabase.client.from('event_breakout_assignments');
  }

  private get participantsDb() {
    return this.supabase.client.from('event_participants');
  }

  /** Creates the rooms and auto-balances every current participant across them round-robin. */
  async create(eventId: string, dto: CreateBreakoutRoomsDto): Promise<EventBreakoutRoomWithOccupancy[]> {
    const rows = Array.from({ length: dto.roomCount }, (_, index) => ({
      event_id: eventId,
      label: dto.labels?.[index]?.trim() || `Salle ${index + 1}`,
      capacity: dto.capacity ?? null,
    }));

    const { data: rooms, error } = await this.roomsDb.insert(rows).select(ROOM_COLUMNS);
    if (error) throw new InternalServerErrorException(error.message);
    const createdRooms = rooms as unknown as EventBreakoutRoom[];

    const { data: participants, error: participantsError } = await this.participantsDb
      .select('user_id')
      .eq('event_id', eventId);
    if (participantsError) throw new InternalServerErrorException(participantsError.message);

    const userIds = (participants as unknown as { user_id: string }[]).map((p) => p.user_id);
    if (userIds.length > 0) {
      const assignments = userIds.map((userId, index) => ({
        event_id: eventId,
        room_id: createdRooms[index % createdRooms.length].id,
        user_id: userId,
      }));
      const { error: assignError } = await this.assignmentsDb
        .upsert(assignments, { onConflict: 'event_id,user_id' });
      if (assignError) throw new InternalServerErrorException(assignError.message);
    }

    return this.withOccupancy(eventId, createdRooms);
  }

  async listRooms(eventId: string): Promise<EventBreakoutRoomWithOccupancy[]> {
    const { data, error } = await this.roomsDb.select(ROOM_COLUMNS).eq('event_id', eventId).order('created_at');
    if (error) throw new InternalServerErrorException(error.message);
    return this.withOccupancy(eventId, data as unknown as EventBreakoutRoom[]);
  }

  async myAssignment(eventId: string, userId: string): Promise<string | null> {
    const { data, error } = await this.assignmentsDb
      .select('room_id')
      .eq('event_id', eventId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    return (data as { room_id: string } | null)?.room_id ?? null;
  }

  /**
   * docs/07_UX_UI_SPECIFICATION.md §7: "capacité de salle annexe atteinte : redirection
   * automatique vers la salle la moins chargée, jamais de blocage utilisateur."
   */
  async join(eventId: string, userId: string, roomId: string): Promise<EventBreakoutAssignmentResult> {
    const rooms = await this.listRooms(eventId);
    const requested = rooms.find((r) => r.id === roomId);
    if (!requested) throw new NotFoundException(`Breakout room ${roomId} not found for this event`);

    let targetId = roomId;
    let redirected = false;
    if (requested.capacity !== null && requested.occupant_count >= requested.capacity) {
      const leastLoaded = [...rooms].sort((a, b) => a.occupant_count - b.occupant_count)[0];
      targetId = leastLoaded.id;
      redirected = targetId !== roomId;
    }

    const { error } = await this.assignmentsDb
      .upsert({ event_id: eventId, room_id: targetId, user_id: userId }, { onConflict: 'event_id,user_id' });
    if (error) throw new InternalServerErrorException(error.message);

    return { roomId: targetId, redirected };
  }

  /** "Retour salle principale" — clears the assignment, no room means back in the main event room. */
  async leave(eventId: string, userId: string): Promise<void> {
    const { error } = await this.assignmentsDb.delete().eq('event_id', eventId).eq('user_id', userId);
    if (error) throw new InternalServerErrorException(error.message);
  }

  private async withOccupancy(eventId: string, rooms: EventBreakoutRoom[]): Promise<EventBreakoutRoomWithOccupancy[]> {
    if (rooms.length === 0) return [];
    const { data, error } = await this.assignmentsDb.select('room_id, user_id').eq('event_id', eventId);
    if (error) throw new InternalServerErrorException(error.message);

    const counts = new Map<string, number>();
    for (const row of data as unknown as AssignmentRow[]) {
      counts.set(row.room_id, (counts.get(row.room_id) ?? 0) + 1);
    }
    return rooms.map((room) => ({ ...room, occupant_count: counts.get(room.id) ?? 0 }));
  }
}
