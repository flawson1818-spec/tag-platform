import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { PrayerTestimoniesService } from '../prayer/prayer-testimonies.service';

export const FAITH_ACT_KINDS = ['COMMITMENT', 'FAST', 'TIME_GIFT', 'PRAYER_VIGIL', 'EVANGELISM'] as const;
export type FaithActKind = (typeof FAITH_ACT_KINDS)[number];
export type FaithActStatus = 'ACTIVE' | 'FULFILLED' | 'ABANDONED';

const MISSING = new Set(['42P01', 'PGRST205', '42703', 'PGRST204']);
const UNAVAILABLE = "Les actes de foi ne sont pas encore activés : lance la migration 20261119 dans Supabase.";
const COLUMNS = 'id, user_id, kind, title, description, start_date, end_date, is_public, status, fulfilled_at, testimony_id, created_at';

export interface FaithAct {
  id: string;
  kind: FaithActKind;
  title: string;
  description: string | null;
  startDate: string;
  endDate: string | null;
  isPublic: boolean;
  status: FaithActStatus;
  fulfilledAt: string | null;
  testimonyId: string | null;
  createdAt: string;
  supportCount: number;
  supportedByMe: boolean;
  mine: boolean;
}

interface Row {
  id: string;
  user_id: string;
  kind: FaithActKind;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string | null;
  is_public: boolean;
  status: FaithActStatus;
  fulfilled_at: string | null;
  testimony_id: string | null;
  created_at: string;
}

export interface CreateFaithAct {
  kind: FaithActKind;
  title: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  isPublic?: boolean;
}

/**
 * Actes de foi (cahier des charges unifié §5.8): a member records a commitment, a fast, a gift of
 * time, a prayer vigil, an evangelism outing — shown on their profile (if public), encouraged by
 * the others ("Je te soutiens"), and once fulfilled it can become a testimony (moderated like any
 * other).
 */
@Injectable()
export class FaithActsService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly testimoniesService: PrayerTestimoniesService,
  ) {}

  private get db() {
    return this.supabase.client;
  }

  async create(userId: string, dto: CreateFaithAct): Promise<FaithAct> {
    const today = new Date().toISOString().slice(0, 10);
    const start = dto.startDate ?? today;
    if (dto.endDate && dto.endDate < start) throw new BadRequestException('La date de fin doit être après le début.');
    const { data, error } = await this.db
      .from('faith_acts')
      .insert({
        user_id: userId,
        kind: dto.kind,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        start_date: start,
        end_date: dto.endDate ?? null,
        is_public: dto.isPublic ?? true,
        status: 'ACTIVE',
      })
      .select(COLUMNS)
      .single();
    if (error) this.fail(error);
    return (await this.decorate([data as unknown as Row], userId))[0];
  }

  /** The member's own acts (all), or another member's public ones. */
  async listFor(memberId: string, viewerId: string): Promise<FaithAct[]> {
    let query = this.db.from('faith_acts').select(COLUMNS).eq('user_id', memberId);
    if (memberId !== viewerId) query = query.eq('is_public', true).neq('status', 'ABANDONED');
    const { data, error } = await query.order('created_at', { ascending: false }).limit(100);
    if (error) {
      if (MISSING.has(error.code ?? '')) return [];
      throw new InternalServerErrorException(error.message);
    }
    return this.decorate(data as unknown as Row[], viewerId);
  }

  /** Mark fulfilled (optionally turning it into a testimony), abandon, or edit. */
  async update(
    id: string,
    userId: string,
    patch: { status?: FaithActStatus; title?: string; description?: string; endDate?: string | null; isPublic?: boolean; testimony?: string },
  ): Promise<FaithAct> {
    const row = await this.own(id, userId);
    const changes: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.title !== undefined) changes.title = patch.title.trim();
    if (patch.description !== undefined) changes.description = patch.description.trim() || null;
    if (patch.endDate !== undefined) changes.end_date = patch.endDate;
    if (patch.isPublic !== undefined) changes.is_public = patch.isPublic;
    if (patch.status && patch.status !== row.status) {
      if (row.status !== 'ACTIVE') throw new BadRequestException('Cet acte de foi est déjà clos.');
      changes.status = patch.status;
      if (patch.status === 'FULFILLED') changes.fulfilled_at = new Date().toISOString();
    }
    // "Nourrit les témoignages": the member's words become a testimony, moderated like the others.
    if (patch.testimony?.trim() && (patch.status === 'FULFILLED' || row.status === 'FULFILLED') && !row.testimony_id) {
      const testimony = await this.testimoniesService.create(
        { mediaType: 'TEXT', content: `${row.title}\n\n${patch.testimony.trim()}`.slice(0, 5000) },
        userId,
      );
      changes.testimony_id = testimony.id;
    }
    const { data, error } = await this.db.from('faith_acts').update(changes).eq('id', id).select(COLUMNS).single();
    if (error) this.fail(error);
    return (await this.decorate([data as unknown as Row], userId))[0];
  }

  async remove(id: string, userId: string): Promise<void> {
    await this.own(id, userId);
    const { error } = await this.db.from('faith_acts').delete().eq('id', id);
    if (error) this.fail(error);
  }

  /** "Je te soutiens" — once per person, never on one's own act. */
  async support(id: string, userId: string, on: boolean): Promise<{ supportCount: number; supportedByMe: boolean }> {
    const { data, error } = await this.db.from('faith_acts').select(COLUMNS).eq('id', id).maybeSingle();
    if (error) this.fail(error);
    const row = data as unknown as Row | null;
    if (!row || (!row.is_public && row.user_id !== userId)) throw new NotFoundException('Acte de foi introuvable.');
    if (row.user_id === userId) throw new BadRequestException('On ne se soutient pas soi-même — mais on persévère !');
    const table = this.db.from('faith_act_supports');
    const { error: writeError } = on
      ? await table.upsert({ act_id: id, user_id: userId }, { onConflict: 'act_id,user_id', ignoreDuplicates: true })
      : await table.delete().eq('act_id', id).eq('user_id', userId);
    if (writeError) this.fail(writeError);
    const [act] = await this.decorate([row], userId);
    return { supportCount: act.supportCount, supportedByMe: act.supportedByMe };
  }

  // ---- helpers ----

  private async own(id: string, userId: string): Promise<Row> {
    const { data, error } = await this.db.from('faith_acts').select(COLUMNS).eq('id', id).maybeSingle();
    if (error) this.fail(error);
    const row = data as unknown as Row | null;
    if (!row) throw new NotFoundException('Acte de foi introuvable.');
    if (row.user_id !== userId) throw new ForbiddenException('Ce n’est pas ton acte de foi.');
    return row;
  }

  private async decorate(rows: Row[], viewerId: string): Promise<FaithAct[]> {
    const ids = rows.map((r) => r.id);
    let supports: { act_id: string; user_id: string }[] = [];
    if (ids.length) {
      const { data, error } = await this.db.from('faith_act_supports').select('act_id, user_id').in('act_id', ids);
      if (!error && Array.isArray(data)) supports = data as typeof supports;
    }
    return rows.map((r) => {
      const own = supports.filter((s) => s.act_id === r.id);
      return {
        id: r.id,
        kind: r.kind,
        title: r.title,
        description: r.description,
        startDate: r.start_date,
        endDate: r.end_date,
        isPublic: r.is_public,
        status: r.status,
        fulfilledAt: r.fulfilled_at,
        testimonyId: r.testimony_id,
        createdAt: r.created_at,
        supportCount: own.length,
        supportedByMe: own.some((s) => s.user_id === viewerId),
        mine: r.user_id === viewerId,
      };
    });
  }

  private fail(error: { code?: string; message: string }): never {
    if (MISSING.has(error.code ?? '')) throw new ServiceUnavailableException(UNAVAILABLE);
    throw new InternalServerErrorException(error.message);
  }
}
