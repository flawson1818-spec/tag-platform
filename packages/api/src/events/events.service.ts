import { ConflictException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { buildPaginationMeta, PaginatedResult, paginationRange } from '../common/pagination';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateEventDto } from './dto/create-event.dto';
import { ListEventsQueryDto } from './dto/list-events.query.dto';
import { Event, EventParticipant, EventStatus } from './event.entity';
import { assertEventTransition } from './event-state-machine';

const EVENT_COLUMNS =
  'id, community_id, type, title, description, scheduled_at, status, created_at, updated_at, deleted_at';
const PARTICIPANT_COLUMNS =
  'id, event_id, user_id, role_in_event, hand_raised_at, created_at, user:user_id(display_name)';

@Injectable()
export class EventsService {
  constructor(private readonly supabase: SupabaseService) {}

  private get db() {
    return this.supabase.client.from('events');
  }

  private get participantsDb() {
    return this.supabase.client.from('event_participants');
  }

  async create(dto: CreateEventDto, actorId: string): Promise<Event> {
    const { data, error } = await this.db
      .insert({
        community_id: dto.communityId ?? null,
        type: dto.type,
        title: dto.title,
        description: dto.description ?? null,
        scheduled_at: dto.scheduledAt,
        status: 'CREATED',
        created_by: actorId,
        updated_by: actorId,
      })
      .select(EVENT_COLUMNS)
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return data as unknown as Event;
  }

  async findById(id: string): Promise<Event> {
    const { data, error } = await this.db.select(EVENT_COLUMNS).eq('id', id).is('deleted_at', null).maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException(`Event ${id} not found`);
    return data as unknown as Event;
  }

  async list(query: ListEventsQueryDto): Promise<PaginatedResult<Event>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { from, to } = paginationRange(page, limit);

    let request = this.db
      .select(EVENT_COLUMNS, { count: 'exact' })
      .is('deleted_at', null)
      .order('scheduled_at', { ascending: true })
      .range(from, to);
    if (query.type) request = request.eq('type', query.type);
    if (query.communityId) request = request.eq('community_id', query.communityId);

    const { data, error, count } = await request;
    if (error) throw new InternalServerErrorException(error.message);

    return { data: data as unknown as Event[], meta: buildPaginationMeta(page, limit, count ?? 0) };
  }

  async updateStatus(id: string, status: EventStatus, actorId: string): Promise<Event> {
    const event = await this.findById(id);
    assertEventTransition(event.status, status);

    const { data, error } = await this.db
      .update({ status, updated_by: actorId })
      .eq('id', id)
      .select(EVENT_COLUMNS)
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return data as unknown as Event;
  }

  async softDelete(id: string, actorId: string): Promise<void> {
    await this.findById(id);
    const { error } = await this.db
      .update({ deleted_at: new Date().toISOString(), updated_by: actorId })
      .eq('id', id);
    if (error) throw new InternalServerErrorException(error.message);
  }

  async join(eventId: string, userId: string): Promise<EventParticipant> {
    await this.findById(eventId);
    const { data, error } = await this.participantsDb
      .upsert(
        { event_id: eventId, user_id: userId, role_in_event: 'ATTENDEE' },
        { onConflict: 'event_id,user_id', ignoreDuplicates: true },
      )
      .select(PARTICIPANT_COLUMNS)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (data) return this.mapParticipant(data);

    // Already registered (upsert with ignoreDuplicates returns nothing on conflict) — return the existing row.
    const { data: existing, error: fetchError } = await this.participantsDb
      .select(PARTICIPANT_COLUMNS)
      .eq('event_id', eventId)
      .eq('user_id', userId)
      .maybeSingle();
    if (fetchError) throw new InternalServerErrorException(fetchError.message);
    if (!existing) throw new ConflictException('Failed to register for this event');
    return this.mapParticipant(existing);
  }

  async listParticipants(eventId: string): Promise<EventParticipant[]> {
    const { data, error } = await this.participantsDb
      .select(PARTICIPANT_COLUMNS)
      .eq('event_id', eventId)
      .order('created_at', { ascending: true });
    if (error) throw new InternalServerErrorException(error.message);
    return (data as unknown as Array<Record<string, unknown>>).map((row) => this.mapParticipant(row));
  }

  /**
   * 07_UX_UI_SPECIFICATION.md §7 — "salle en direct avec mains levées". Upserts rather than
   * requiring a prior join() call, and only sets hand_raised_at in the upsert payload so an
   * existing role_in_event (e.g. already-granted SPEAKER) is left untouched — Postgres's
   * ON CONFLICT DO UPDATE only touches the columns actually listed, not the whole row.
   */
  async raiseHand(eventId: string, userId: string): Promise<EventParticipant> {
    await this.findById(eventId);
    const { data, error } = await this.participantsDb
      .upsert({ event_id: eventId, user_id: userId, hand_raised_at: new Date().toISOString() }, { onConflict: 'event_id,user_id' })
      .select(PARTICIPANT_COLUMNS)
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return this.mapParticipant(data as unknown as Record<string, unknown>);
  }

  async lowerHand(eventId: string, userId: string): Promise<void> {
    const { error } = await this.participantsDb
      .update({ hand_raised_at: null })
      .eq('event_id', eventId)
      .eq('user_id', userId);
    if (error) throw new InternalServerErrorException(error.message);
  }

  /** Moderator-only (event.manage): grants or revokes the floor, same bookkeeping-only meaning as the prayer room's speak:grant — no audio transport is wired up here either. */
  async setParticipantRole(
    eventId: string,
    targetUserId: string,
    role: EventParticipant['role_in_event'],
  ): Promise<EventParticipant> {
    const { data, error } = await this.participantsDb
      .update({ role_in_event: role })
      .eq('event_id', eventId)
      .eq('user_id', targetUserId)
      .select(PARTICIPANT_COLUMNS)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException(`No participant ${targetUserId} registered for event ${eventId}`);
    return this.mapParticipant(data as unknown as Record<string, unknown>);
  }

  private mapParticipant(row: Record<string, unknown>): EventParticipant {
    const { user, ...rest } = row as Omit<EventParticipant, 'display_name'> & {
      user: { display_name: string } | null;
    };
    return { ...rest, display_name: user?.display_name ?? null };
  }
}
