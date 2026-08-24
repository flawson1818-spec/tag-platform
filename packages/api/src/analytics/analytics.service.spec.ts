import { AnalyticsService } from './analytics.service';
import { createQueryChain, createSupabaseServiceMock } from '../testing/supabase-query-mock';

function buildStorageBucket(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    upload: vi.fn().mockResolvedValue({ data: {}, error: null }),
    createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://export.example/file.json' }, error: null }),
    ...overrides,
  };
}

function buildService(
  perTable: Record<string, unknown>,
  rpcResults: Record<string, { data: unknown; error: unknown }> = {},
  storageOverrides: Partial<Record<string, unknown>> = {},
) {
  const supabaseMock = createSupabaseServiceMock(perTable as never);
  const bucket = buildStorageBucket(storageOverrides);
  const rpc = vi.fn((name: string) => Promise.resolve(rpcResults[name] ?? { data: [], error: null }));
  const supabase = { client: { ...supabaseMock.client, rpc, storage: { from: vi.fn(() => bucket) } } };
  const service = new AnalyticsService(supabase as never);
  return { service, bucket, rpc };
}

describe('AnalyticsService', () => {
  describe('getWorldMap', () => {
    it('returns zero presence with no active rooms when nothing is RUNNING', async () => {
      const { service } = buildService({ prayer_slots: createQueryChain({ data: [], error: null }) });

      const result = await service.getWorldMap();

      expect(result).toEqual({ presence: 0, activeRooms: 0, timezones: [] });
    });

    it('counts distinct programs as activeRooms and distinct users as presence', async () => {
      const runningSlots = [
        { id: 'slot-1', program_id: 'program-1' },
        { id: 'slot-2', program_id: 'program-1' }, // same program, still 1 active room
        { id: 'slot-3', program_id: 'program-2' },
      ];
      const attendance = [
        { user_id: 'user-1', users: { timezone: 'Africa/Abidjan' } },
        { user_id: 'user-2', users: { timezone: 'Africa/Abidjan' } },
        { user_id: 'user-3', users: { timezone: 'Europe/Paris' } },
      ];
      const { service } = buildService({
        prayer_slots: createQueryChain({ data: runningSlots, error: null }),
        prayer_slot_attendance: createQueryChain({ data: attendance, error: null }),
      });

      const result = await service.getWorldMap();

      expect(result.activeRooms).toBe(2);
      expect(result.presence).toBe(3);
      expect(result.timezones).toEqual([
        { timezone: 'Africa/Abidjan', count: 2 },
        { timezone: 'Europe/Paris', count: 1 },
      ]);
    });

    it('deduplicates a user attending via multiple slots (counted once in presence)', async () => {
      const runningSlots = [
        { id: 'slot-1', program_id: 'program-1' },
        { id: 'slot-2', program_id: 'program-2' },
      ];
      const attendance = [
        { user_id: 'user-1', users: { timezone: 'Africa/Abidjan' } },
        { user_id: 'user-1', users: { timezone: 'Africa/Abidjan' } },
      ];
      const { service } = buildService({
        prayer_slots: createQueryChain({ data: runningSlots, error: null }),
        prayer_slot_attendance: createQueryChain({ data: attendance, error: null }),
      });

      const result = await service.getWorldMap();

      expect(result.presence).toBe(1);
    });

    it('ignores attendance rows whose user record was deleted (null join)', async () => {
      const { service } = buildService({
        prayer_slots: createQueryChain({ data: [{ id: 'slot-1', program_id: 'program-1' }], error: null }),
        prayer_slot_attendance: createQueryChain({ data: [{ user_id: 'user-1', users: null }], error: null }),
      });

      const result = await service.getWorldMap();

      expect(result.presence).toBe(0);
    });
  });

  describe('getDashboard', () => {
    it('maps every RPC result from snake_case to camelCase', async () => {
      const { service } = buildService(
        {},
        {
          analytics_top_categories: { data: [{ category: 'Famille', request_count: 12 }], error: null },
          analytics_growth: { data: [{ day: '2026-06-01', new_users: 5 }], error: null },
          analytics_peak_hours: { data: [{ hour_of_day: 20, attendance_count: 300 }], error: null },
          analytics_retention: { data: [{ period: 'W1', eligible_users: 100, retained_users: 40, retention_rate: 0.4 }], error: null },
        },
      );

      const result = await service.getDashboard();

      expect(result).toEqual({
        topCategories: [{ category: 'Famille', requestCount: 12 }],
        growth: [{ day: '2026-06-01', newUsers: 5 }],
        peakHours: [{ hourOfDay: 20, attendanceCount: 300 }],
        retention: [{ period: 'W1', eligibleUsers: 100, retainedUsers: 40, retentionRate: 0.4 }],
      });
    });

    it('throws if any of the four RPC calls errors', async () => {
      const { service } = buildService(
        {},
        { analytics_growth: { data: null, error: { message: 'function does not exist' } } },
      );

      await expect(service.getDashboard()).rejects.toThrow('function does not exist');
    });
  });

  describe('requestExport', () => {
    it('rejects an unknown export scope before touching the database', async () => {
      const { service } = buildService({});

      await expect(service.requestExport('not-a-real-scope', 'admin-1')).rejects.toThrow(
        'Unknown export scope: not-a-real-scope',
      );
    });

    it('runs the full pipeline for a known scope: insert GENERATING, upload, sign, mark READY', async () => {
      const exportsChain = createQueryChain({
        data: { id: 'export-1', requested_by: 'admin-1', scope: 'testimonies', status: 'GENERATING', download_url: null, expires_at: null, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' },
        error: null,
      });
      const testimoniesChain = createQueryChain({ data: [{ id: 'testimony-1' }], error: null });
      const { service, bucket } = buildService({ exports: exportsChain, testimonies: testimoniesChain });

      const result = await service.requestExport('testimonies', 'admin-1');

      expect(exportsChain.insert).toHaveBeenCalledWith(expect.objectContaining({ scope: 'testimonies', status: 'GENERATING' }));
      expect(bucket.upload).toHaveBeenCalledWith('exports/export-1.json', expect.any(String), { contentType: 'application/json' });
      expect(bucket.createSignedUrl).toHaveBeenCalled();
      expect(exportsChain.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'READY', download_url: 'https://export.example/file.json' }),
      );
      expect(result).toBeDefined();
    });

    it('never selects password_hash for a users export (secret column exclusion)', async () => {
      const exportsChain = createQueryChain({
        data: { id: 'export-1', requested_by: 'admin-1', scope: 'users', status: 'GENERATING' },
        error: null,
      });
      const usersChain = createQueryChain({ data: [], error: null });
      const { service } = buildService({ exports: exportsChain, users: usersChain });

      await service.requestExport('users', 'admin-1');

      expect(usersChain.select).toHaveBeenCalledWith('id, display_name, locale, timezone, status, created_at');
    });
  });
});
