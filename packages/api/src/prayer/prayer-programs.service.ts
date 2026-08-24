import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { buildPaginationMeta, PaginatedResult, paginationRange } from '../common/pagination';
import { SupabaseService } from '../supabase/supabase.service';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { CreateProgramDto } from './dto/create-program.dto';
import { UpdateProgramDto } from './dto/update-program.dto';
import { PrayerProgram, PrayerProgramStatus } from './prayer-program.entity';
import { PrayerSlotsService } from './prayer-slots.service';
import { assertProgramTransition } from './prayer-state-machines';

const PROGRAM_COLUMNS = 'id, community_id, title, recurrence_rule, status, created_at, updated_at, deleted_at';

@Injectable()
export class PrayerProgramsService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly slotsService: PrayerSlotsService,
  ) {}

  private get db() {
    return this.supabase.client.from('prayer_programs');
  }

  async create(dto: CreateProgramDto, actorId: string): Promise<PrayerProgram> {
    const { data, error } = await this.db
      .insert({
        community_id: dto.communityId ?? null,
        title: dto.title,
        recurrence_rule: dto.recurrenceRule,
        status: 'DRAFT',
        created_by: actorId,
        updated_by: actorId,
      })
      .select(PROGRAM_COLUMNS)
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return data as unknown as PrayerProgram;
  }

  async findById(id: string): Promise<PrayerProgram> {
    const { data, error } = await this.db
      .select(PROGRAM_COLUMNS)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException(`Prayer program ${id} not found`);
    return data as unknown as PrayerProgram;
  }

  async list(query: PaginationQueryDto & { communityId?: string }): Promise<PaginatedResult<PrayerProgram>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { from, to } = paginationRange(page, limit);

    let request = this.db
      .select(PROGRAM_COLUMNS, { count: 'exact' })
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(from, to);
    request = query.communityId
      ? request.eq('community_id', query.communityId)
      : request;

    const { data, error, count } = await request;
    if (error) throw new InternalServerErrorException(error.message);

    return { data: data as unknown as PrayerProgram[], meta: buildPaginationMeta(page, limit, count ?? 0) };
  }

  async update(id: string, dto: UpdateProgramDto, actorId: string): Promise<PrayerProgram> {
    const program = await this.findById(id);
    const nextStatus = (dto.status as PrayerProgramStatus | undefined) ?? program.status;
    assertProgramTransition(program.status, nextStatus);

    const { data, error } = await this.db
      .update({
        title: dto.title,
        recurrence_rule: dto.recurrenceRule,
        status: nextStatus,
        updated_by: actorId,
      })
      .eq('id', id)
      .select(PROGRAM_COLUMNS)
      .single();
    if (error) throw new InternalServerErrorException(error.message);

    if (nextStatus === 'ACTIVE' && program.status !== 'ACTIVE') {
      await this.ensureRunningSlot(id);
    }

    return data as unknown as PrayerProgram;
  }

  /** Engine-only: every currently active program, across all rooms. */
  async listActive(): Promise<PrayerProgram[]> {
    const { data, error } = await this.db.select(PROGRAM_COLUMNS).eq('status', 'ACTIVE').is('deleted_at', null);
    if (error) throw new InternalServerErrorException(error.message);
    return data as unknown as PrayerProgram[];
  }

  /** Returns the single active program for a room (community_id, or NULL for the world room). */
  async findActiveByCommunity(communityId: string | null): Promise<PrayerProgram | null> {
    let request = this.db.select(PROGRAM_COLUMNS).eq('status', 'ACTIVE').is('deleted_at', null);
    request = communityId ? request.eq('community_id', communityId) : request.is('community_id', null);
    const { data, error } = await request
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    return data as unknown as PrayerProgram | null;
  }

  async softDelete(id: string): Promise<void> {
    await this.findById(id);
    const { error } = await this.db.update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (error) throw new InternalServerErrorException(error.message);
  }

  /** Kicks off the first slot if the program has none currently RUNNING. */
  private async ensureRunningSlot(programId: string): Promise<void> {
    const running = await this.slotsService.findRunningSlotByProgram(programId);
    if (running) return;
    const first = await this.slotsService.findFirstByProgram(programId);
    const durationSeconds = Math.max(
      1,
      Math.round((new Date(first.end_at).getTime() - new Date(first.start_at).getTime()) / 1000),
    );
    await this.slotsService.activate(first.id, durationSeconds);
  }
}
