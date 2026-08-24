import { PrayerProgramsService } from './prayer-programs.service';
import { createQueryChain, createSupabaseServiceMock } from '../testing/supabase-query-mock';

const DRAFT_PROGRAM = {
  id: 'program-1',
  community_id: null,
  title: 'Programme mondial',
  recurrence_rule: null,
  status: 'DRAFT',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  deleted_at: null,
};

function buildDeps(overrides: Partial<Record<string, unknown>> = {}) {
  const slotsService = overrides.slotsService ?? {
    findRunningSlotByProgram: vi.fn().mockResolvedValue(null),
    findFirstByProgram: vi.fn(),
    activate: vi.fn(),
  };
  const supabase = overrides.supabase ?? createSupabaseServiceMock({});
  const service = new PrayerProgramsService(supabase as never, slotsService as never);
  return { service, slotsService, supabase };
}

describe('PrayerProgramsService', () => {
  describe('update — state machine', () => {
    it('allows DRAFT -> PLANNED', async () => {
      const supabase = createSupabaseServiceMock({
        prayer_programs: [
          createQueryChain({ data: DRAFT_PROGRAM, error: null }), // findById
          createQueryChain({ data: { ...DRAFT_PROGRAM, status: 'PLANNED' }, error: null }), // update
        ],
      });
      const { service } = buildDeps({ supabase });

      const result = await service.update('program-1', { status: 'PLANNED' } as never, 'actor-1');

      expect(result.status).toBe('PLANNED');
    });

    it('rejects an illegal jump from DRAFT straight to ACTIVE', async () => {
      const supabase = createSupabaseServiceMock({
        prayer_programs: createQueryChain({ data: DRAFT_PROGRAM, error: null }),
      });
      const { service } = buildDeps({ supabase });

      await expect(service.update('program-1', { status: 'ACTIVE' } as never, 'actor-1')).rejects.toThrow(
        'Cannot transition prayer program from DRAFT to ACTIVE',
      );
    });

    it('rejects transitioning out of the terminal ARCHIVED status', async () => {
      const supabase = createSupabaseServiceMock({
        prayer_programs: createQueryChain({ data: { ...DRAFT_PROGRAM, status: 'ARCHIVED' }, error: null }),
      });
      const { service } = buildDeps({ supabase });

      await expect(service.update('program-1', { status: 'PLANNED' } as never, 'actor-1')).rejects.toThrow(
        'Cannot transition prayer program from ARCHIVED to PLANNED',
      );
    });

    it('allows PAUSED -> ACTIVE -> COMPLETED but not COMPLETED -> ACTIVE (no going back)', async () => {
      const supabase = createSupabaseServiceMock({
        prayer_programs: createQueryChain({ data: { ...DRAFT_PROGRAM, status: 'COMPLETED' }, error: null }),
      });
      const { service } = buildDeps({ supabase });

      await expect(service.update('program-1', { status: 'ACTIVE' } as never, 'actor-1')).rejects.toThrow(
        'Cannot transition prayer program from COMPLETED to ACTIVE',
      );
    });

    it('is a no-op transition check when status is not changing (from === to)', async () => {
      const supabase = createSupabaseServiceMock({
        prayer_programs: [
          createQueryChain({ data: { ...DRAFT_PROGRAM, status: 'PLANNED' }, error: null }),
          createQueryChain({ data: { ...DRAFT_PROGRAM, status: 'PLANNED', title: 'Renamed' }, error: null }),
        ],
      });
      const { service } = buildDeps({ supabase });

      const result = await service.update('program-1', { title: 'Renamed' } as never, 'actor-1');

      expect(result.title).toBe('Renamed');
    });
  });

  describe('update — ensureRunningSlot on activation', () => {
    it('activates the first slot when a program transitions into ACTIVE with nothing running', async () => {
      const supabase = createSupabaseServiceMock({
        prayer_programs: [
          createQueryChain({ data: { ...DRAFT_PROGRAM, status: 'PLANNED' }, error: null }),
          createQueryChain({ data: { ...DRAFT_PROGRAM, status: 'ACTIVE' }, error: null }),
        ],
      });
      const firstSlot = { id: 'slot-1', start_at: '2026-01-01T08:00:00.000Z', end_at: '2026-01-01T08:10:00.000Z' };
      const slotsService = {
        findRunningSlotByProgram: vi.fn().mockResolvedValue(null),
        findFirstByProgram: vi.fn().mockResolvedValue(firstSlot),
        activate: vi.fn().mockResolvedValue(firstSlot),
      };
      const { service } = buildDeps({ supabase, slotsService });

      await service.update('program-1', { status: 'ACTIVE' } as never, 'actor-1');

      expect(slotsService.activate).toHaveBeenCalledWith('slot-1', 600);
    });

    it('does not re-activate a slot when one is already RUNNING', async () => {
      const supabase = createSupabaseServiceMock({
        prayer_programs: [
          createQueryChain({ data: { ...DRAFT_PROGRAM, status: 'PLANNED' }, error: null }),
          createQueryChain({ data: { ...DRAFT_PROGRAM, status: 'ACTIVE' }, error: null }),
        ],
      });
      const slotsService = {
        findRunningSlotByProgram: vi.fn().mockResolvedValue({ id: 'slot-already-running' }),
        findFirstByProgram: vi.fn(),
        activate: vi.fn(),
      };
      const { service } = buildDeps({ supabase, slotsService });

      await service.update('program-1', { status: 'ACTIVE' } as never, 'actor-1');

      expect(slotsService.activate).not.toHaveBeenCalled();
    });

    it('does not touch slots when the program stays ACTIVE (e.g. a title-only edit)', async () => {
      const supabase = createSupabaseServiceMock({
        prayer_programs: [
          createQueryChain({ data: { ...DRAFT_PROGRAM, status: 'ACTIVE' }, error: null }),
          createQueryChain({ data: { ...DRAFT_PROGRAM, status: 'ACTIVE', title: 'Renamed' }, error: null }),
        ],
      });
      const slotsService = {
        findRunningSlotByProgram: vi.fn(),
        findFirstByProgram: vi.fn(),
        activate: vi.fn(),
      };
      const { service } = buildDeps({ supabase, slotsService });

      await service.update('program-1', { title: 'Renamed' } as never, 'actor-1');

      expect(slotsService.findRunningSlotByProgram).not.toHaveBeenCalled();
    });
  });

  describe('findActiveByCommunity', () => {
    it('queries community_id IS NULL for the world room', async () => {
      const chain = createQueryChain({ data: null, error: null });
      const supabase = createSupabaseServiceMock({ prayer_programs: chain });
      const { service } = buildDeps({ supabase });

      await service.findActiveByCommunity(null);

      expect(chain.is).toHaveBeenCalledWith('community_id', null);
    });

    it('queries a specific community_id when given', async () => {
      const chain = createQueryChain({ data: null, error: null });
      const supabase = createSupabaseServiceMock({ prayer_programs: chain });
      const { service } = buildDeps({ supabase });

      await service.findActiveByCommunity('community-1');

      expect(chain.eq).toHaveBeenCalledWith('community_id', 'community-1');
    });
  });

  describe('softDelete', () => {
    it('throws if the program does not exist', async () => {
      const supabase = createSupabaseServiceMock({
        prayer_programs: createQueryChain({ data: null, error: null }),
      });
      const { service } = buildDeps({ supabase });

      await expect(service.softDelete('missing')).rejects.toThrow('Prayer program missing not found');
    });
  });
});
