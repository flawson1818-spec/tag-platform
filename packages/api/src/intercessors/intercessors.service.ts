import { Injectable, InternalServerErrorException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PermissionsService } from '../access/permissions.service';
import { PRAYER_LEADER_ELIGIBLE_ROLES, PRAYER_REQUEST_CATEGORIES } from '../prayer/prayer-constants';
import { SupabaseService } from '../supabase/supabase.service';

export type Availability = 'AVAILABLE' | 'BUSY' | 'OFFLINE';

export interface IntercessorProfile {
  availability: Availability;
  prayerSkills: string[];
  maxActive: number;
}

export interface Recommendation {
  userId: string;
  displayName: string;
  score: number;
  availability: Availability;
  activeRequests: number;
  maxActive: number;
  matchesTopic: boolean;
  full: boolean;
}

const MISSING = new Set(['42P01', '42703', 'PGRST204', 'PGRST205']);
const UNAVAILABLE = "Le profil d'intercesseur n'est pas encore activé : lance la migration 20261114 dans Supabase.";
export const DEFAULT_PROFILE: IntercessorProfile = { availability: 'AVAILABLE', prayerSkills: [], maxActive: 5 };
/** Requests an intercessor is still carrying. */
const ACTIVE_STATUSES = ['ASSIGNED', 'IN_PROGRESS', 'WAITING'];

/**
 * Pilot V8 score, out of 100: topic 40 · availability 25 · free capacity 25 · 10 for someone
 * carrying nothing yet (the pilot's "urgency + online" — the platform has neither an urgency
 * level on requests nor a reliable online flag, so the last points favour spreading the load).
 */
export function scoreIntercessor(profile: IntercessorProfile, activeRequests: number, category: string): Omit<Recommendation, 'userId' | 'displayName'> {
  const matchesTopic = profile.prayerSkills.some((s) => s.toLocaleLowerCase('fr') === category.toLocaleLowerCase('fr'));
  const full = activeRequests >= profile.maxActive;
  const availabilityPoints = profile.availability === 'AVAILABLE' ? 25 : profile.availability === 'BUSY' ? 10 : 0;
  const capacityPoints = full ? 0 : Math.round((25 * (profile.maxActive - activeRequests)) / profile.maxActive);
  const score = (matchesTopic ? 40 : 0) + availabilityPoints + capacityPoints + (activeRequests === 0 ? 10 : 0);
  return { score, availability: profile.availability, activeRequests, maxActive: profile.maxActive, matchesTopic, full };
}

/**
 * Intercessors' operational profile and the recommendation used when the administration
 * entrusts a request (cahier des charges unifié §5.5). The platform recommends; the
 * administrator decides — nothing is ever assigned automatically.
 */
@Injectable()
export class IntercessorsService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly permissionsService: PermissionsService,
  ) {}

  private get db() {
    return this.supabase.client;
  }

  async myProfile(userId: string): Promise<IntercessorProfile> {
    const { data, error } = await this.db
      .from('intercessor_profiles')
      .select('availability, prayer_skills, max_active')
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !data) return { ...DEFAULT_PROFILE };
    const row = data as { availability: Availability; prayer_skills: string[] | null; max_active: number };
    return { availability: row.availability, prayerSkills: row.prayer_skills ?? [], maxActive: row.max_active };
  }

  async updateMyProfile(userId: string, patch: Partial<IntercessorProfile>): Promise<IntercessorProfile> {
    const current = await this.myProfile(userId);
    const next: IntercessorProfile = {
      availability: patch.availability ?? current.availability,
      prayerSkills: (patch.prayerSkills ?? current.prayerSkills).filter((s) => (PRAYER_REQUEST_CATEGORIES as readonly string[]).includes(s)),
      maxActive: patch.maxActive ?? current.maxActive,
    };
    const { error } = await this.db.from('intercessor_profiles').upsert(
      {
        user_id: userId,
        availability: next.availability,
        prayer_skills: next.prayerSkills,
        max_active: next.maxActive,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
    if (error) {
      if (MISSING.has(error.code ?? '')) throw new ServiceUnavailableException(UNAVAILABLE);
      throw new InternalServerErrorException(error.message);
    }
    return next;
  }

  /** Every intercessor (or above), best match first, with why. */
  async recommend(requestId: string, limit = 5): Promise<Recommendation[]> {
    const { data: request, error } = await this.db
      .from('prayer_requests')
      .select('id, category')
      .eq('id', requestId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!request) throw new NotFoundException('Demande introuvable.');
    const category = (request as { category: string }).category;

    const ids = await this.permissionsService.listUserIdsWithAnyRole([...PRAYER_LEADER_ELIGIBLE_ROLES]);
    if (ids.length === 0) return [];

    const [users, profiles, load] = await Promise.all([
      this.db.from('users').select('id, display_name').in('id', ids).eq('status', 'ACTIVE').is('deleted_at', null),
      this.db.from('intercessor_profiles').select('user_id, availability, prayer_skills, max_active').in('user_id', ids),
      this.db.from('prayer_requests').select('assigned_to').in('assigned_to', ids).in('status', ACTIVE_STATUSES).is('deleted_at', null),
    ]);
    if (users.error) throw new InternalServerErrorException(users.error.message);
    const profileRows = (profiles.error ? [] : (profiles.data ?? [])) as {
      user_id: string;
      availability: Availability;
      prayer_skills: string[] | null;
      max_active: number;
    }[];
    const loadRows = (load.error ? [] : (load.data ?? [])) as { assigned_to: string }[];

    return ((users.data ?? []) as { id: string; display_name: string }[])
      .map((u) => {
        const p = profileRows.find((r) => r.user_id === u.id);
        const profile = p
          ? { availability: p.availability, prayerSkills: p.prayer_skills ?? [], maxActive: p.max_active }
          : DEFAULT_PROFILE;
        const active = loadRows.filter((r) => r.assigned_to === u.id).length;
        return { userId: u.id, displayName: u.display_name, ...scoreIntercessor(profile, active, category) };
      })
      .sort((a, b) => b.score - a.score || a.activeRequests - b.activeRequests || a.displayName.localeCompare(b.displayName))
      .slice(0, Math.max(1, Math.min(20, limit)));
  }
}
