import { GamificationService } from './gamification.service';
import { createQueryChain, createSupabaseServiceMock } from '../testing/supabase-query-mock';

/** Builds an attendance row for a slot running from `start` for `hours` hours. */
function attendance(start: string, hours: number, category = 'Famille') {
  const end = new Date(new Date(start).getTime() + hours * 3_600_000).toISOString();
  return { slot: { start_at: start, end_at: end, category } };
}

describe('GamificationService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00.000Z')); // a Monday
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getMyStats', () => {
    it('computes total hours and a broken streak (0) when the most recent session is older than yesterday', async () => {
      const rows = [attendance('2026-06-10T08:00:00.000Z', 1)];
      const supabase = createSupabaseServiceMock({
        prayer_slot_attendance: createQueryChain({ data: rows, error: null }),
        users: createQueryChain({ data: { leaderboard_opt_in: false }, error: null }),
      });
      const service = new GamificationService(supabase as never);

      const result = await service.getMyStats('user-1');

      expect(result.totalHours).toBe(1);
      expect(result.currentStreakDays).toBe(0);
      expect(result.badges).not.toContain('Fidèle');
    });

    it('counts a streak of consecutive days ending today', async () => {
      const rows = [
        attendance('2026-06-15T08:00:00.000Z', 1), // today
        attendance('2026-06-14T08:00:00.000Z', 1), // yesterday
        attendance('2026-06-13T08:00:00.000Z', 1), // day before
      ];
      const supabase = createSupabaseServiceMock({
        prayer_slot_attendance: createQueryChain({ data: rows, error: null }),
        users: createQueryChain({ data: { leaderboard_opt_in: false }, error: null }),
      });
      const service = new GamificationService(supabase as never);

      const result = await service.getMyStats('user-1');

      expect(result.currentStreakDays).toBe(3);
    });

    it('still counts the streak when the most recent session was yesterday (today not required)', async () => {
      const rows = [
        attendance('2026-06-14T08:00:00.000Z', 1), // yesterday
        attendance('2026-06-13T08:00:00.000Z', 1),
      ];
      const supabase = createSupabaseServiceMock({
        prayer_slot_attendance: createQueryChain({ data: rows, error: null }),
        users: createQueryChain({ data: { leaderboard_opt_in: false }, error: null }),
      });
      const service = new GamificationService(supabase as never);

      const result = await service.getMyStats('user-1');

      expect(result.currentStreakDays).toBe(2);
    });

    it('breaks the streak count at the first gap day, even with older attendance further back', async () => {
      const rows = [
        attendance('2026-06-15T08:00:00.000Z', 1), // today
        attendance('2026-06-14T08:00:00.000Z', 1), // yesterday
        // gap: no 06-13
        attendance('2026-06-12T08:00:00.000Z', 1),
      ];
      const supabase = createSupabaseServiceMock({
        prayer_slot_attendance: createQueryChain({ data: rows, error: null }),
        users: createQueryChain({ data: { leaderboard_opt_in: false }, error: null }),
      });
      const service = new GamificationService(supabase as never);

      const result = await service.getMyStats('user-1');

      expect(result.currentStreakDays).toBe(2);
    });

    it('awards the Fidèle badge at a 7-day streak', async () => {
      const rows = Array.from({ length: 7 }, (_, i) =>
        attendance(new Date(Date.UTC(2026, 5, 15 - i, 8)).toISOString(), 1),
      );
      const supabase = createSupabaseServiceMock({
        prayer_slot_attendance: createQueryChain({ data: rows, error: null }),
        users: createQueryChain({ data: { leaderboard_opt_in: false }, error: null }),
      });
      const service = new GamificationService(supabase as never);

      const result = await service.getMyStats('user-1');

      expect(result.currentStreakDays).toBe(7);
      expect(result.badges).toContain('Fidèle');
    });

    it('awards Intercesseur des Nations at 5 distinct categories', async () => {
      const categories = ['Famille', 'Finances', 'Santé', 'Nation', 'Jeunesse'];
      const rows = categories.map((c) => attendance('2026-06-15T08:00:00.000Z', 1, c));
      const supabase = createSupabaseServiceMock({
        prayer_slot_attendance: createQueryChain({ data: rows, error: null }),
        users: createQueryChain({ data: { leaderboard_opt_in: false }, error: null }),
      });
      const service = new GamificationService(supabase as never);

      const result = await service.getMyStats('user-1');

      expect(result.badges).toContain('Intercesseur des Nations');
    });

    it('awards Veilleur de nuit for a session starting before 5am UTC', async () => {
      const rows = [attendance('2026-06-15T03:00:00.000Z', 1)];
      const supabase = createSupabaseServiceMock({
        prayer_slot_attendance: createQueryChain({ data: rows, error: null }),
        users: createQueryChain({ data: { leaderboard_opt_in: false }, error: null }),
      });
      const service = new GamificationService(supabase as never);

      const result = await service.getMyStats('user-1');

      expect(result.badges).toContain('Veilleur de nuit');
    });

    it('ignores attendance rows whose slot was deleted (null join)', async () => {
      const rows = [{ slot: null }, attendance('2026-06-15T08:00:00.000Z', 2)];
      const supabase = createSupabaseServiceMock({
        prayer_slot_attendance: createQueryChain({ data: rows, error: null }),
        users: createQueryChain({ data: { leaderboard_opt_in: false }, error: null }),
      });
      const service = new GamificationService(supabase as never);

      const result = await service.getMyStats('user-1');

      expect(result.totalHours).toBe(2);
    });

    it('reports the caller current leaderboard opt-in state', async () => {
      const supabase = createSupabaseServiceMock({
        prayer_slot_attendance: createQueryChain({ data: [], error: null }),
        users: createQueryChain({ data: { leaderboard_opt_in: true }, error: null }),
      });
      const service = new GamificationService(supabase as never);

      const result = await service.getMyStats('user-1');

      expect(result.leaderboardOptIn).toBe(true);
    });
  });

  describe('getCommunityGoal', () => {
    it('sums hours attended so far this month against the fixed target', async () => {
      const rows = [attendance('2026-06-01T00:00:00.000Z', 5), attendance('2026-06-10T00:00:00.000Z', 3)];
      const supabase = createSupabaseServiceMock({
        prayer_slot_attendance: createQueryChain({ data: rows, error: null }),
      });
      const service = new GamificationService(supabase as never);

      const result = await service.getCommunityGoal();

      expect(result).toEqual({ targetHours: 10000, achievedHours: 8, month: '2026-06' });
    });
  });

  describe('getLeaderboard', () => {
    it('sums hours per opted-in user, sorted descending, capped at 10', async () => {
      const rows = [
        { user: { display_name: 'Alice' }, slot: { start_at: '2026-06-01T00:00:00.000Z', end_at: '2026-06-01T01:00:00.000Z' } },
        { user: { display_name: 'Alice' }, slot: { start_at: '2026-06-02T00:00:00.000Z', end_at: '2026-06-02T02:00:00.000Z' } },
        { user: { display_name: 'Bob' }, slot: { start_at: '2026-06-01T00:00:00.000Z', end_at: '2026-06-01T05:00:00.000Z' } },
      ];
      const supabase = createSupabaseServiceMock({
        prayer_slot_attendance: createQueryChain({ data: rows, error: null }),
      });
      const service = new GamificationService(supabase as never);

      const result = await service.getLeaderboard();

      expect(result).toEqual([
        { displayName: 'Bob', hours: 5 },
        { displayName: 'Alice', hours: 3 },
      ]);
    });

    it('skips rows whose slot was deleted (null join)', async () => {
      const rows = [{ user: { display_name: 'Alice' }, slot: null }];
      const supabase = createSupabaseServiceMock({
        prayer_slot_attendance: createQueryChain({ data: rows, error: null }),
      });
      const service = new GamificationService(supabase as never);

      const result = await service.getLeaderboard();

      expect(result).toEqual([]);
    });
  });

  describe('setLeaderboardOptIn', () => {
    it('updates the caller leaderboard_opt_in flag', async () => {
      const chain = createQueryChain({ data: null, error: null });
      const supabase = createSupabaseServiceMock({ users: chain });
      const service = new GamificationService(supabase as never);

      await service.setLeaderboardOptIn('user-1', true);

      expect(chain.update).toHaveBeenCalledWith({ leaderboard_opt_in: true });
      expect(chain.eq).toHaveBeenCalledWith('id', 'user-1');
    });
  });
});
