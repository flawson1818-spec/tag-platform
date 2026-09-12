import { Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { DashboardSnapshot, WorldMapSnapshot } from './analytics.types';

const EXPORT_ROW_LIMIT = 5000;
const EXPORT_TTL_HOURS = 24;
const BUCKET = 'tag-files';

/**
 * docs/07_UX_UI_SPECIFICATION.md §12 cas d'erreur: a timezone bucket below this count must
 * never be shown with its exact size (indirect identification risk in a sparsely-populated
 * region) — folded into a single regional bucket instead. Also required by
 * docs/08_NON_FUNCTIONAL_REQUIREMENTS.md §7.
 */
const WORLD_MAP_ANONYMITY_THRESHOLD = 5;
const WORLD_MAP_REGIONAL_BUCKET = 'Autres';

/** Columns to exclude per export scope — never leak secrets like password_hash. */
const EXPORT_COLUMNS: Record<string, string> = {
  prayer_requests: 'id, category, description, confidentiality, status, created_at',
  testimonies: 'id, media_type, content, status, created_at',
  users: 'id, display_name, locale, timezone, status, created_at',
  communities: 'id, type, name, parent_id, language, timezone, created_at',
};

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private readonly supabase: SupabaseService) {}

  async getWorldMap(): Promise<WorldMapSnapshot> {
    const { data: runningSlots, error: slotsError } = await this.supabase.client
      .from('prayer_slots')
      .select('id, program_id')
      .eq('status', 'RUNNING');
    if (slotsError) throw new InternalServerErrorException(slotsError.message);

    const slotIds = (runningSlots ?? []).map((s) => s.id);
    const activeRooms = new Set((runningSlots ?? []).map((s) => s.program_id)).size;
    const activeEvents = await this.countActiveEvents();

    if (slotIds.length === 0) {
      return { presence: 0, activeRooms, activeEvents, timezones: [] };
    }

    const { data: attendance, error: attendanceError } = await this.supabase.client
      .from('prayer_slot_attendance')
      .select('user_id, users(timezone)')
      .in('slot_id', slotIds);
    if (attendanceError) throw new InternalServerErrorException(attendanceError.message);

    const byUser = new Map<string, string>();
    for (const row of (attendance ?? []) as unknown as { user_id: string; users: { timezone: string } | null }[]) {
      if (row.users) byUser.set(row.user_id, row.users.timezone);
    }

    const timezoneCounts = new Map<string, number>();
    for (const timezone of byUser.values()) {
      timezoneCounts.set(timezone, (timezoneCounts.get(timezone) ?? 0) + 1);
    }

    const sorted = Array.from(timezoneCounts, ([timezone, count]) => ({ timezone, count })).sort(
      (a, b) => b.count - a.count,
    );
    const visible = sorted.filter((t) => t.count >= WORLD_MAP_ANONYMITY_THRESHOLD);
    const regionalTotal = sorted
      .filter((t) => t.count < WORLD_MAP_ANONYMITY_THRESHOLD)
      .reduce((sum, t) => sum + t.count, 0);

    return {
      presence: byUser.size,
      activeRooms,
      activeEvents,
      timezones: regionalTotal > 0 ? [...visible, { timezone: WORLD_MAP_REGIONAL_BUCKET, count: regionalTotal }] : visible,
    };
  }

  /**
   * docs/01_FUNCTIONAL_SPECIFICATION.md §9 / docs/07_UX_UI_SPECIFICATION.md §12 wireframe: the
   * world map must also show events currently in progress, alongside presence/rooms/timezones.
   * Fail-open to 0 — a KPI tile must never take down the whole snapshot.
   */
  private async countActiveEvents(): Promise<number> {
    try {
      const { count, error } = await this.supabase.client
        .from('events')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'RUNNING')
        .is('deleted_at', null);
      if (error) throw new InternalServerErrorException(error.message);
      return count ?? 0;
    } catch (error) {
      this.logger.error('Failed to count active events for the world map', error as Error);
      return 0;
    }
  }

  async getDashboard(): Promise<DashboardSnapshot> {
    const [topCategories, growth, peakHours, retention] = await Promise.all([
      this.supabase.client.rpc('analytics_top_categories', { limit_count: 10 }),
      this.supabase.client.rpc('analytics_growth', { days: 30 }),
      this.supabase.client.rpc('analytics_peak_hours'),
      this.supabase.client.rpc('analytics_retention'),
    ]);
    for (const result of [topCategories, growth, peakHours, retention]) {
      if (result.error) throw new InternalServerErrorException(result.error.message);
    }

    return {
      topCategories: (topCategories.data ?? []).map((r: { category: string; request_count: number }) => ({
        category: r.category,
        requestCount: r.request_count,
      })),
      growth: (growth.data ?? []).map((r: { day: string; new_users: number }) => ({
        day: r.day,
        newUsers: r.new_users,
      })),
      peakHours: (peakHours.data ?? []).map((r: { hour_of_day: number; attendance_count: number }) => ({
        hourOfDay: r.hour_of_day,
        attendanceCount: r.attendance_count,
      })),
      retention: (retention.data ?? []).map(
        (r: { period: string; eligible_users: number; retained_users: number; retention_rate: number | null }) => ({
          period: r.period,
          eligibleUsers: r.eligible_users,
          retainedUsers: r.retained_users,
          retentionRate: r.retention_rate,
        }),
      ),
    };
  }

  async requestExport(scope: string, requestedBy: string) {
    const columns = EXPORT_COLUMNS[scope];
    if (!columns) throw new NotFoundException(`Unknown export scope: ${scope}`);

    const { data: exportRow, error: insertError } = await this.supabase.client
      .from('exports')
      .insert({ requested_by: requestedBy, scope, status: 'GENERATING' })
      .select('id, requested_by, scope, status, download_url, expires_at, created_at, updated_at')
      .single();
    if (insertError) throw new InternalServerErrorException(insertError.message);

    const { data: rows, error: queryError } = await this.supabase.client
      .from(scope)
      .select(columns)
      .order('created_at', { ascending: false })
      .limit(EXPORT_ROW_LIMIT);
    if (queryError) throw new InternalServerErrorException(queryError.message);

    const objectPath = `exports/${exportRow.id}.json`;
    const { error: uploadError } = await this.supabase.client.storage
      .from(BUCKET)
      .upload(objectPath, JSON.stringify(rows ?? [], null, 2), { contentType: 'application/json' });
    if (uploadError) throw new InternalServerErrorException(uploadError.message);

    const expiresAt = new Date(Date.now() + EXPORT_TTL_HOURS * 60 * 60 * 1000);
    const { data: signed, error: signError } = await this.supabase.client.storage
      .from(BUCKET)
      .createSignedUrl(objectPath, EXPORT_TTL_HOURS * 60 * 60);
    if (signError) throw new InternalServerErrorException(signError.message);

    const { data: updated, error: updateError } = await this.supabase.client
      .from('exports')
      .update({ status: 'READY', download_url: signed.signedUrl, expires_at: expiresAt.toISOString() })
      .eq('id', exportRow.id)
      .select('id, requested_by, scope, status, download_url, expires_at, created_at, updated_at')
      .single();
    if (updateError) throw new InternalServerErrorException(updateError.message);

    return updated;
  }
}
