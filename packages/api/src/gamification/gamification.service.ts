import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

const COMMUNITY_MONTHLY_GOAL_HOURS = 10000;
const LEADERBOARD_SIZE = 10;

interface AttendanceRow {
  slot: { start_at: string; end_at: string; category: string } | null;
}

export interface MyGamificationStats {
  totalHours: number;
  currentStreakDays: number;
  badges: string[];
  leaderboardOptIn: boolean;
}

export interface CommunityGoal {
  targetHours: number;
  achievedHours: number;
  month: string;
}

export interface LeaderboardEntry {
  displayName: string;
  hours: number;
}

function hoursBetween(start: string, end: string): number {
  return Math.max(0, (new Date(end).getTime() - new Date(start).getTime()) / 3_600_000);
}

function dateKey(iso: string): string {
  return iso.slice(0, 10);
}

@Injectable()
export class GamificationService {
  constructor(private readonly supabase: SupabaseService) {}

  async getMyStats(userId: string): Promise<MyGamificationStats> {
    const { data, error } = await this.supabase.client
      .from('prayer_slot_attendance')
      .select('slot:slot_id(start_at, end_at, category)')
      .eq('user_id', userId);
    if (error) throw new InternalServerErrorException(error.message);

    const rows = (data ?? []) as unknown as AttendanceRow[];
    const attended = rows.filter((row): row is { slot: NonNullable<AttendanceRow['slot']> } => row.slot !== null);

    const totalHours = Math.round(attended.reduce((sum, row) => sum + hoursBetween(row.slot.start_at, row.slot.end_at), 0) * 10) / 10;

    const attendedDates = Array.from(new Set(attended.map((row) => dateKey(row.slot.start_at)))).sort(
      (a, b) => (a < b ? 1 : -1),
    );
    const currentStreakDays = this.computeStreak(attendedDates);

    const distinctCategories = new Set(attended.map((row) => row.slot.category));
    const nightOwl = attended.some((row) => new Date(row.slot.start_at).getUTCHours() < 5);

    const badges: string[] = [];
    if (currentStreakDays >= 7) badges.push('Fidèle');
    if (distinctCategories.size >= 5) badges.push('Intercesseur des Nations');
    if (nightOwl) badges.push('Veilleur de nuit');

    const { data: userRow, error: userError } = await this.supabase.client
      .from('users')
      .select('leaderboard_opt_in')
      .eq('id', userId)
      .single();
    if (userError) throw new InternalServerErrorException(userError.message);

    return { totalHours, currentStreakDays, badges, leaderboardOptIn: (userRow as { leaderboard_opt_in: boolean }).leaderboard_opt_in };
  }

  async getCommunityGoal(): Promise<CommunityGoal> {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

    const { data, error } = await this.supabase.client
      .from('prayer_slot_attendance')
      .select('slot:slot_id!inner(start_at, end_at)')
      .gte('slot.start_at', monthStart);
    if (error) throw new InternalServerErrorException(error.message);

    const rows = (data ?? []) as unknown as AttendanceRow[];
    const achievedHours = Math.round(
      rows.reduce((sum, row) => sum + (row.slot ? hoursBetween(row.slot.start_at, row.slot.end_at) : 0), 0),
    );

    return {
      targetHours: COMMUNITY_MONTHLY_GOAL_HOURS,
      achievedHours,
      month: monthStart.slice(0, 7),
    };
  }

  async getLeaderboard(): Promise<LeaderboardEntry[]> {
    const { data, error } = await this.supabase.client
      .from('prayer_slot_attendance')
      .select('user:user_id!inner(display_name, leaderboard_opt_in), slot:slot_id(start_at, end_at)')
      .eq('user.leaderboard_opt_in', true);
    if (error) throw new InternalServerErrorException(error.message);

    const rows = (data ?? []) as unknown as { user: { display_name: string }; slot: { start_at: string; end_at: string } | null }[];
    const hoursByUser = new Map<string, number>();
    for (const row of rows) {
      if (!row.slot) continue;
      const hours = hoursBetween(row.slot.start_at, row.slot.end_at);
      hoursByUser.set(row.user.display_name, (hoursByUser.get(row.user.display_name) ?? 0) + hours);
    }

    return Array.from(hoursByUser.entries())
      .map(([displayName, hours]) => ({ displayName, hours: Math.round(hours * 10) / 10 }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, LEADERBOARD_SIZE);
  }

  async setLeaderboardOptIn(userId: string, optIn: boolean): Promise<void> {
    const { error } = await this.supabase.client.from('users').update({ leaderboard_opt_in: optIn }).eq('id', userId);
    if (error) throw new InternalServerErrorException(error.message);
  }

  /** Most recent attended date must be today or yesterday, or the streak is considered broken. */
  private computeStreak(datesDesc: string[]): number {
    if (datesDesc.length === 0) return 0;
    const today = dateKey(new Date().toISOString());
    const yesterday = dateKey(new Date(Date.now() - 86_400_000).toISOString());
    if (datesDesc[0] !== today && datesDesc[0] !== yesterday) return 0;

    let streak = 1;
    let cursor = new Date(datesDesc[0]);
    for (let i = 1; i < datesDesc.length; i++) {
      cursor = new Date(cursor.getTime() - 86_400_000);
      if (dateKey(cursor.toISOString()) === datesDesc[i]) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  }
}
