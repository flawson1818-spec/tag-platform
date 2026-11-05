import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateSlotDto } from './dto/create-slot.dto';
import { UpdateSlotDto } from './dto/update-slot.dto';
import { PrayerSlot } from './prayer-slot.entity';
import { toDailySlotRange } from './daily-slot-time';
import { PRAYER_LEADER_ELIGIBLE_ROLES } from './prayer-constants';

const SLOT_COLUMNS =
  'id, program_id, order_index, title, category, importance, start_at, end_at, guided_text, bible_references, recommended_songs, leader_user_id, status, created_at, updated_at, leader:leader_user_id(display_name)';

type SlotRow = Omit<PrayerSlot, 'leader_display_name'> & { leader: { display_name: string } | null };

function mapSlot(row: SlotRow): PrayerSlot {
  const { leader, ...rest } = row;
  return { ...rest, leader_display_name: leader?.display_name ?? null };
}

@Injectable()
export class PrayerSlotsService {
  constructor(private readonly supabase: SupabaseService) {}

  private get db() {
    return this.supabase.client.from('prayer_slots');
  }

  async create(programId: string, dto: CreateSlotDto): Promise<PrayerSlot> {
    const { startAt, endAt } = toDailySlotRange(dto.startTime, dto.endTime);
    return this.insertSlot(programId, {
      title: dto.title,
      startAt,
      endAt,
      guidedText: dto.guidedText,
      bibleReferences: dto.bibleReferences,
      recommendedSongs: dto.recommendedSongs,
      leaderUserId: dto.leaderUserId,
      orderIndex: dto.orderIndex,
    });
  }

  /**
   * Shared by create() (daily "HH:mm" input, converted above) and injectUrgent() (a real "now"
   * window, built directly — an urgent slot isn't part of the recurring daily schedule).
   */
  private async insertSlot(
    programId: string,
    input: {
      title: string;
      category?: string;
      importance?: string;
      startAt: string;
      endAt: string;
      guidedText?: string;
      bibleReferences?: string[];
      recommendedSongs?: string[];
      leaderUserId?: string;
      orderIndex?: number;
    },
  ): Promise<PrayerSlot> {
    await this.assertNoOverlap(programId, input.startAt, input.endAt);
    const orderIndex = input.orderIndex ?? (await this.nextOrderIndex(programId));
    const { data, error } = await this.db
      .insert({
        program_id: programId,
        order_index: orderIndex,
        title: input.title,
        category: input.category,
        importance: input.importance ?? 'Normal',
        start_at: input.startAt,
        end_at: input.endAt,
        guided_text: input.guidedText,
        bible_references: input.bibleReferences ?? [],
        recommended_songs: input.recommendedSongs ?? [],
        leader_user_id: input.leaderUserId ?? null,
        status: 'SCHEDULED',
      })
      .select(SLOT_COLUMNS)
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return mapSlot(data as unknown as SlotRow);
  }

  async findById(id: string): Promise<PrayerSlot> {
    const { data, error } = await this.db.select(SLOT_COLUMNS).eq('id', id).maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException(`Prayer slot ${id} not found`);
    return mapSlot(data as unknown as SlotRow);
  }

  async listForProgram(programId: string): Promise<PrayerSlot[]> {
    const { data, error } = await this.db
      .select(SLOT_COLUMNS)
      .eq('program_id', programId)
      .neq('status', 'ARCHIVED')
      .order('order_index', { ascending: true });
    if (error) throw new InternalServerErrorException(error.message);
    return (data as unknown as SlotRow[]).map(mapSlot);
  }

  async update(id: string, dto: UpdateSlotDto): Promise<PrayerSlot> {
    const existing = await this.findById(id);
    let startAt: string | undefined;
    let endAt: string | undefined;
    if (dto.startTime || dto.endTime) {
      if (existing.status !== 'SCHEDULED') {
        throw new ConflictException('Only a SCHEDULED slot\'s time can be changed — this one has already run or is running');
      }
      const range = toDailySlotRange(dto.startTime ?? existing.start_at.slice(11, 16), dto.endTime ?? existing.end_at.slice(11, 16));
      await this.assertNoOverlap(existing.program_id, range.startAt, range.endAt, id);
      startAt = range.startAt;
      endAt = range.endAt;
    }
    const { data, error } = await this.db
      .update({
        title: dto.title,
        guided_text: dto.guidedText,
        bible_references: dto.bibleReferences,
        recommended_songs: dto.recommendedSongs,
        leader_user_id: dto.leaderUserId,
        order_index: dto.orderIndex,
        ...(startAt && endAt ? { start_at: startAt, end_at: endAt } : {}),
      })
      .eq('id', id)
      .select(SLOT_COLUMNS)
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return mapSlot(data as unknown as SlotRow);
  }

  async remove(id: string): Promise<void> {
    const slot = await this.findById(id);
    if (slot.status === 'RUNNING' || slot.status === 'FINISHED') {
      throw new ConflictException('Cannot delete a slot that has already run or is running');
    }
    const { error } = await this.db.delete().eq('id', id);
    if (error) throw new InternalServerErrorException(error.message);
  }

  /** Preview of what the engine would activate next — does not change any state. */
  async findNext(id: string): Promise<PrayerSlot> {
    const slot = await this.findById(id);
    return (await this.nextAfter(slot)).slot;
  }

  /**
   * The segment that follows `slot` in its créneau, skipping ARCHIVED ones (segments removed by
   * replaceSchedule). `wraps` is true when `slot` was the créneau's last segment and the room
   * starts over from the first one — that moment is the relay (see PrayerEngineService).
   */
  async nextAfter(slot: PrayerSlot): Promise<{ slot: PrayerSlot; wraps: boolean }> {
    const { data, error } = await this.db
      .select(SLOT_COLUMNS)
      .eq('program_id', slot.program_id)
      .neq('status', 'ARCHIVED')
      .gt('order_index', slot.order_index)
      .order('order_index', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (data) return { slot: mapSlot(data as unknown as SlotRow), wraps: false };
    return { slot: await this.findFirstByProgram(slot.program_id), wraps: true };
  }

  /**
   * How long a segment is meant to last. duration_seconds (migration 20261106) is the source of
   * truth; read separately and fail-open so a database without that column still runs, falling
   * back to the segment's own start/end window — never the previous segment's (the old bug).
   */
  async intendedDurationSeconds(slot: PrayerSlot): Promise<number> {
    const fallback = Math.max(
      1,
      Math.round((new Date(slot.end_at).getTime() - new Date(slot.start_at).getTime()) / 1000),
    );
    const { data, error } = await this.db.select('duration_seconds').eq('id', slot.id).maybeSingle();
    if (error || !data) return fallback;
    const stored = (data as { duration_seconds: number | null }).duration_seconds;
    return stored && stored > 0 ? stored : fallback;
  }

  /**
   * Replaces a créneau's segments in one go — what a moderator does after pasting a new créneau
   * (docs/01_FUNCTIONAL_SPECIFICATION.md §3: prayers are written in advance). Existing segment
   * rows are REUSED by position rather than deleted: prayer_slot_attendance cascades on delete,
   * and deleting would erase everyone's prayer hours. Extra old segments become ARCHIVED (the
   * engine and the program list skip them). The RUNNING segment keeps its live window; its new
   * text shows right away and its new duration applies from its next turn.
   */
  async replaceSchedule(
    programId: string,
    segments: { title: string; durationSeconds: number; guidedText?: string; bibleReferences?: string[] }[],
  ): Promise<PrayerSlot[]> {
    if (segments.length === 0) throw new BadRequestException('Un créneau doit contenir au moins un segment.');

    const { data: rows, error } = await this.db
      .select(SLOT_COLUMNS)
      .eq('program_id', programId)
      .order('order_index', { ascending: true });
    if (error) throw new InternalServerErrorException(error.message);
    const existing = ((rows ?? []) as unknown as SlotRow[]).map(mapSlot);
    const reusable = existing.filter((slot) => slot.status !== 'ARCHIVED');
    const archived = existing.filter((slot) => slot.status === 'ARCHIVED');

    // Live segments keep their order; the reference-date chain keeps assertNoOverlap meaningful.
    let cursor = Date.parse('2000-01-01T00:00:00.000Z');
    const topOrder = existing.reduce((max, slot) => Math.max(max, slot.order_index), -1);

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const startAt = new Date(cursor).toISOString();
      const endAt = new Date(cursor + segment.durationSeconds * 1000).toISOString();
      cursor += segment.durationSeconds * 1000;
      const content = {
        title: segment.title,
        guided_text: segment.guidedText ?? null,
        bible_references: segment.bibleReferences ?? [],
        order_index: i,
      };
      const target = reusable[i] ?? archived.shift();
      if (target) {
        const window =
          target.status === 'RUNNING' ? {} : { start_at: startAt, end_at: endAt, status: 'SCHEDULED' };
        // Parked above every current position, then renumbered 0..n-1 below.
        const { error: updateError } = await this.db
          .update({ ...content, ...window, order_index: topOrder + 1 + i })
          .eq('id', target.id);
        if (updateError) throw new InternalServerErrorException(updateError.message);
        await this.writeDuration(target.id, segment.durationSeconds);
      } else {
        const { data: created, error: insertError } = await this.db
          .insert({
            program_id: programId,
            ...content,
            order_index: topOrder + 1 + i,
            importance: 'Normal',
            start_at: startAt,
            end_at: endAt,
            recommended_songs: [],
            status: 'SCHEDULED',
          })
          .select('id')
          .single();
        if (insertError) throw new InternalServerErrorException(insertError.message);
        await this.writeDuration((created as { id: string }).id, segment.durationSeconds);
      }
    }

    // Old segments beyond the new créneau's length: archived, never deleted (history stays).
    for (const slot of reusable.slice(segments.length)) {
      const { error: archiveError } = await this.db
        .update({ status: 'ARCHIVED', order_index: topOrder + 1 + segments.length + slot.order_index })
        .eq('id', slot.id);
      if (archiveError) throw new InternalServerErrorException(archiveError.message);
    }

    // Final positions 0..n-1, now that nothing else occupies them.
    const { data: placed, error: placedError } = await this.db
      .select('id, order_index')
      .eq('program_id', programId)
      .neq('status', 'ARCHIVED')
      .gt('order_index', topOrder)
      .order('order_index', { ascending: true });
    if (placedError) throw new InternalServerErrorException(placedError.message);
    for (const row of (placed ?? []) as { id: string; order_index: number }[]) {
      const { error: orderError } = await this.db
        .update({ order_index: row.order_index - topOrder - 1 })
        .eq('id', row.id);
      if (orderError) throw new InternalServerErrorException(orderError.message);
    }

    return this.listForProgram(programId);
  }

  /** Fail-open: without migration 20261106 the duration simply isn't stored. */
  private async writeDuration(id: string, durationSeconds: number): Promise<void> {
    await this.db.update({ duration_seconds: durationSeconds }).eq('id', id);
  }

  async findByOrderIndex(programId: string, orderIndex: number): Promise<PrayerSlot | null> {
    const { data, error } = await this.db
      .select(SLOT_COLUMNS)
      .eq('program_id', programId)
      .eq('order_index', orderIndex)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    return data ? mapSlot(data as unknown as SlotRow) : null;
  }

  async findFirstByProgram(programId: string): Promise<PrayerSlot> {
    const { data, error } = await this.db
      .select(SLOT_COLUMNS)
      .eq('program_id', programId)
      .neq('status', 'ARCHIVED')
      .order('order_index', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException(`Prayer program ${programId} has no slots`);
    return mapSlot(data as unknown as SlotRow);
  }

  /**
   * Only one slot should ever be RUNNING per program at a time. Selecting a set (instead of
   * `.maybeSingle()`) and self-healing here — rather than throwing — means a data anomaly
   * (e.g. a race during an engine restart) degrades to "pick the most recent one" instead of
   * crash-looping the tick that's supposed to keep the room alive.
   */
  async findRunningSlotByProgram(programId: string): Promise<PrayerSlot | null> {
    const { data, error } = await this.db
      .select(SLOT_COLUMNS)
      .eq('program_id', programId)
      .eq('status', 'RUNNING')
      .order('start_at', { ascending: false });
    if (error) throw new InternalServerErrorException(error.message);
    const rows = (data ?? []) as unknown as SlotRow[];
    if (rows.length > 1) {
      await Promise.all(rows.slice(1).map((row) => this.markFinished(row.id)));
    }
    return rows.length ? mapSlot(rows[0]) : null;
  }

  /** Engine-only: slots whose window has elapsed and still marked RUNNING. */
  async findExpiredRunningSlots(): Promise<PrayerSlot[]> {
    const { data, error } = await this.db
      .select(SLOT_COLUMNS)
      .eq('status', 'RUNNING')
      .lte('end_at', new Date().toISOString());
    if (error) throw new InternalServerErrorException(error.message);
    return (data as unknown as SlotRow[]).map(mapSlot);
  }

  /** Engine-only: activates a slot for durationSeconds starting now. */
  async activate(id: string, durationSeconds: number): Promise<PrayerSlot> {
    const startAt = new Date();
    const endAt = new Date(startAt.getTime() + durationSeconds * 1000);
    const { data, error } = await this.db
      .update({ status: 'RUNNING', start_at: startAt.toISOString(), end_at: endAt.toISOString() })
      .eq('id', id)
      .select(SLOT_COLUMNS)
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return mapSlot(data as unknown as SlotRow);
  }

  /** Engine-only. */
  async markFinished(id: string): Promise<void> {
    const { error } = await this.db.update({ status: 'FINISHED' }).eq('id', id);
    if (error) throw new InternalServerErrorException(error.message);
  }

  /**
   * 07_UX_UI_SPECIFICATION.md §4 — "injection d'un sujet d'urgence": cuts short whatever is
   * currently RUNNING in the program (if anything) and activates the urgent slot in its place
   * right away. The interrupted slot is marked FINISHED with end_at truncated to now, exactly
   * like a natural transition just early, so assertNoOverlap doesn't see its original window as
   * still occupying "now". The urgent slot is appended after the program's existing slots
   * (nextOrderIndex) rather than reusing the interrupted slot's order_index, so it can never
   * collide with another slot at the same position — the tradeoff (flagged deliberately, not an
   * oversight) is that once the urgent slot ends the engine wraps to the first slot rather than
   * resuming mid-sequence, so the rest of the interrupted pass resumes on the next loop.
   */
  async injectUrgent(
    programId: string,
    input: { title: string; category: string; guidedText?: string; durationSeconds: number },
  ): Promise<{ interrupted: PrayerSlot | null; activated: PrayerSlot }> {
    const running = await this.findRunningSlotByProgram(programId);
    if (running) await this.cutShort(running.id);

    const created = await this.insertSlot(programId, {
      title: input.title,
      category: input.category,
      importance: 'Urgent',
      startAt: new Date().toISOString(),
      endAt: new Date(Date.now() + input.durationSeconds * 1000).toISOString(),
      guidedText: input.guidedText,
    });
    const activated = await this.activate(created.id, input.durationSeconds);
    return { interrupted: running, activated };
  }

  private async cutShort(id: string): Promise<void> {
    const { error } = await this.db.update({ status: 'FINISHED', end_at: new Date().toISOString() }).eq('id', id);
    if (error) throw new InternalServerErrorException(error.message);
  }

  /**
   * Best-effort presence tracking for analytics (peak hours). Errors are swallowed on purpose
   * so a presence-tracking hiccup never breaks the realtime join flow.
   */
  async recordAttendance(slotId: string, userId: string): Promise<void> {
    await this.supabase.client
      .from('prayer_slot_attendance')
      .upsert({ slot_id: slotId, user_id: userId }, { onConflict: 'slot_id,user_id', ignoreDuplicates: true });
  }

  /** Users eligible to lead a slot (Intercesseur and above), for the moderator's assignment UI. */
  async listLeaderCandidates(search?: string): Promise<{ id: string; display_name: string }[]> {
    const { data, error } = await this.supabase.client
      .from('role_assignments')
      .select('users(id, display_name), roles!inner(code)')
      .in('roles.code', PRAYER_LEADER_ELIGIBLE_ROLES);
    if (error) throw new InternalServerErrorException(error.message);

    const needle = search?.toLowerCase();
    const byId = new Map<string, string>();
    for (const row of (data ?? []) as unknown as { users: { id: string; display_name: string } | null }[]) {
      if (!row.users) continue;
      if (needle && !row.users.display_name.toLowerCase().includes(needle)) continue;
      byId.set(row.users.id, row.users.display_name);
    }
    return Array.from(byId, ([id, display_name]) => ({ id, display_name })).sort((a, b) =>
      a.display_name.localeCompare(b.display_name),
    );
  }

  /**
   * 07_UX_UI_SPECIFICATION.md §4 — a program is a single timeline; the engine also assumes
   * at most one RUNNING slot at a time, so two overlapping SCHEDULED slots would eventually
   * fight over that assumption. Rejected up front, at create time, with the conflicting
   * slot(s) named — never silently accepted.
   */
  private async assertNoOverlap(
    programId: string,
    startAt: string,
    endAt: string,
    excludeSlotId?: string,
  ): Promise<void> {
    if (new Date(startAt).getTime() >= new Date(endAt).getTime()) {
      throw new BadRequestException('endAt must be after startAt');
    }
    let query = this.db
      .select('title, start_at, end_at')
      .eq('program_id', programId)
      .lt('start_at', endAt)
      .gt('end_at', startAt);
    if (excludeSlotId) query = query.neq('id', excludeSlotId);
    const { data, error } = await query;
    if (error) throw new InternalServerErrorException(error.message);
    const conflicts = (data ?? []) as { title: string; start_at: string; end_at: string }[];
    if (conflicts.length > 0) {
      const names = conflicts.map((c) => `« ${c.title} » (${c.start_at} – ${c.end_at})`).join(', ');
      throw new ConflictException(`Ce créneau chevauche un créneau existant : ${names}`);
    }
  }

  private async nextOrderIndex(programId: string): Promise<number> {
    const { data, error } = await this.db
      .select('order_index')
      .eq('program_id', programId)
      .order('order_index', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    return data ? (data as unknown as { order_index: number }).order_index + 1 : 0;
  }
}
