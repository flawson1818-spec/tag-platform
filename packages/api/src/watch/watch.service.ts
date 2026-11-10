import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DEFAULT_PRAYER_TIMEZONE } from '../prayer/zoned-time';
import { SupabaseService } from '../supabase/supabase.service';
import { SetFlambeauDto, SetIntentionDto, UpdateFlambeauDto } from './dto/watch.dto';

const MISSING = new Set(['42P01', '42703', 'PGRST204', 'PGRST205']);
const UNAVAILABLE = "La veille du jour n'est pas encore activée : lance la migration 20261112 dans Supabase.";
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The guardian's watch list for a day (cahier des charges unifié §5.3). */
export const DEFAULT_CHECKLIST = [
  'Ouvrir la journée dans la prière',
  'Vérifier le programme de la salle de prière',
  'Accueillir les nouveaux membres',
  'Encourager la communauté',
  'Clôturer la journée dans la prière',
];

export interface Intention {
  day: string;
  title: string;
  description: string | null;
  bibleReference: string | null;
}

export interface Flambeau {
  day: string;
  guardian: { id: string; displayName: string };
  checklist: { label: string; done: boolean }[];
  encouragement: string | null;
}

interface IntentionRow {
  day: string;
  title: string;
  description: string | null;
  bible_reference: string | null;
}

interface FlambeauRow {
  day: string;
  guardian_id: string;
  checklist: { label: string; done: boolean }[] | null;
  encouragement: string | null;
  guardian: { display_name: string } | null;
}

/** Today's date where the world room keeps watch ("2026-11-10"). */
export function localDay(at: Date = new Date(), timeZone = DEFAULT_PRAYER_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

function toIntention(row: IntentionRow): Intention {
  return { day: row.day, title: row.title, description: row.description, bibleReference: row.bible_reference };
}

function toFlambeau(row: FlambeauRow): Flambeau {
  return {
    day: row.day,
    guardian: { id: row.guardian_id, displayName: row.guardian?.display_name ?? 'Responsable' },
    checklist: Array.isArray(row.checklist) ? row.checklist : [],
    encouragement: row.encouragement,
  };
}

/**
 * The day's watch, from the pilot V1: the world prayer intention of the day and the Flambeau —
 * the leader who keeps watch over that day. Prepared ahead by the administration; nothing is
 * ever invented when a day has not been prepared.
 */
@Injectable()
export class WatchService {
  constructor(private readonly supabase: SupabaseService) {}

  private get db() {
    return this.supabase.client;
  }

  private fail(error: { code?: string; message: string }): never {
    if (MISSING.has(error.code ?? '')) throw new ServiceUnavailableException(UNAVAILABLE);
    throw new InternalServerErrorException(error.message);
  }

  private assertDay(day: string): void {
    if (!DAY.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`))) {
      throw new BadRequestException('Date invalide (format attendu : AAAA-MM-JJ).');
    }
  }

  /** Public: shown on every home page. Fail-open before the migration. */
  async today(): Promise<{ day: string; intention: Intention | null; flambeau: Flambeau | null }> {
    const day = localDay();
    const [intentions, flambeaux] = await Promise.all([
      this.db.from('world_prayer_intentions').select('day, title, description, bible_reference').eq('day', day).maybeSingle(),
      this.db
        .from('flambeau_assignments')
        .select('day, guardian_id, checklist, encouragement, guardian:guardian_id(display_name)')
        .eq('day', day)
        .maybeSingle(),
    ]);
    return {
      day,
      intention: !intentions.error && intentions.data ? toIntention(intentions.data as IntentionRow) : null,
      flambeau: !flambeaux.error && flambeaux.data ? toFlambeau(flambeaux.data as unknown as FlambeauRow) : null,
    };
  }

  /** The administration's planning: every prepared day from `from` for `days` days. */
  async plan(from: string, days: number): Promise<{ intentions: Intention[]; flambeaux: Flambeau[] }> {
    this.assertDay(from);
    const span = Math.min(62, Math.max(1, days));
    const to = new Date(Date.parse(`${from}T00:00:00Z`) + (span - 1) * 86400000).toISOString().slice(0, 10);
    const [intentions, flambeaux] = await Promise.all([
      this.db.from('world_prayer_intentions').select('day, title, description, bible_reference').gte('day', from).lte('day', to).order('day'),
      this.db
        .from('flambeau_assignments')
        .select('day, guardian_id, checklist, encouragement, guardian:guardian_id(display_name)')
        .gte('day', from)
        .lte('day', to)
        .order('day'),
    ]);
    if (intentions.error && !MISSING.has(intentions.error.code ?? '')) this.fail(intentions.error);
    if (flambeaux.error && !MISSING.has(flambeaux.error.code ?? '')) this.fail(flambeaux.error);
    return {
      intentions: ((intentions.error ? [] : intentions.data) ?? []).map((r) => toIntention(r as IntentionRow)),
      flambeaux: ((flambeaux.error ? [] : flambeaux.data) ?? []).map((r) => toFlambeau(r as unknown as FlambeauRow)),
    };
  }

  async setIntention(day: string, dto: SetIntentionDto, actorId: string): Promise<Intention> {
    this.assertDay(day);
    const { data, error } = await this.db
      .from('world_prayer_intentions')
      .upsert(
        {
          day,
          title: dto.title,
          description: dto.description || null,
          bible_reference: dto.bibleReference || null,
          created_by: actorId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'day' },
      )
      .select('day, title, description, bible_reference')
      .single();
    if (error) this.fail(error);
    return toIntention(data as IntentionRow);
  }

  async removeIntention(day: string): Promise<{ removed: true }> {
    this.assertDay(day);
    const { error } = await this.db.from('world_prayer_intentions').delete().eq('day', day);
    if (error) this.fail(error);
    return { removed: true };
  }

  /** Names the day's guardian. Changing the guardian keeps the list as it was ticked. */
  async setFlambeau(day: string, dto: SetFlambeauDto, actorId: string): Promise<Flambeau> {
    this.assertDay(day);
    const { data: guardian, error: guardianError } = await this.db
      .from('users')
      .select('id')
      .eq('id', dto.guardianId)
      .eq('status', 'ACTIVE')
      .is('deleted_at', null)
      .maybeSingle();
    if (guardianError) this.fail(guardianError);
    if (!guardian) throw new NotFoundException('Ce responsable est introuvable.');

    const existing = await this.findFlambeau(day);
    const row: Record<string, unknown> = {
      day,
      guardian_id: dto.guardianId,
      checklist: existing?.checklist.length ? existing.checklist : DEFAULT_CHECKLIST.map((label) => ({ label, done: false })),
      created_by: actorId,
      updated_at: new Date().toISOString(),
    };
    if (dto.encouragement !== undefined) row.encouragement = dto.encouragement || null;
    const { error } = await this.db.from('flambeau_assignments').upsert(row, { onConflict: 'day' });
    if (error) this.fail(error);
    return (await this.findFlambeau(day)) as Flambeau;
  }

  async removeFlambeau(day: string): Promise<{ removed: true }> {
    this.assertDay(day);
    const { error } = await this.db.from('flambeau_assignments').delete().eq('day', day);
    if (error) this.fail(error);
    return { removed: true };
  }

  /** Only the day's guardian — or the administration — ticks the list or writes the encouragement. */
  async updateFlambeau(day: string, dto: UpdateFlambeauDto, actorId: string, canManage: boolean): Promise<Flambeau> {
    this.assertDay(day);
    const flambeau = await this.findFlambeau(day);
    if (!flambeau) throw new NotFoundException('Aucun Flambeau pour ce jour.');
    if (flambeau.guardian.id !== actorId && !canManage) {
      throw new ForbiddenException('Seul le Gardien du Flambeau de ce jour peut le modifier.');
    }
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (dto.item !== undefined) {
      if (dto.item >= flambeau.checklist.length) throw new BadRequestException('Élément de la liste inconnu.');
      patch.checklist = flambeau.checklist.map((entry, i) => (i === dto.item ? { ...entry, done: Boolean(dto.done) } : entry));
    }
    if (dto.encouragement !== undefined) patch.encouragement = dto.encouragement || null;
    const { error } = await this.db.from('flambeau_assignments').update(patch).eq('day', day);
    if (error) this.fail(error);
    return (await this.findFlambeau(day)) as Flambeau;
  }

  private async findFlambeau(day: string): Promise<Flambeau | null> {
    const { data, error } = await this.db
      .from('flambeau_assignments')
      .select('day, guardian_id, checklist, encouragement, guardian:guardian_id(display_name)')
      .eq('day', day)
      .maybeSingle();
    if (error) this.fail(error);
    return data ? toFlambeau(data as unknown as FlambeauRow) : null;
  }
}
