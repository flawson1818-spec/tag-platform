import { PrayerEngineService } from './prayer-engine.service';

function buildSlot(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'slot-1',
    program_id: 'program-1',
    order_index: 0,
    title: 'Prière 1',
    start_at: '2026-08-08T23:00:00.000Z',
    end_at: '2026-08-08T23:05:00.000Z',
    status: 'RUNNING',
    ...overrides,
  };
}

function buildProgram(overrides: Partial<Record<string, unknown>> = {}) {
  return { id: 'program-1', community_id: 'community-1', status: 'ACTIVE', ...overrides };
}

function buildDeps() {
  const slotsService = {
    findExpiredRunningSlots: vi.fn().mockResolvedValue([]),
    markFinished: vi.fn().mockResolvedValue(undefined),
    findByOrderIndex: vi.fn().mockResolvedValue(null),
    findFirstByProgram: vi.fn(),
    activate: vi.fn(),
    findRunningSlotByProgram: vi.fn().mockResolvedValue(null),
  };
  const programsService = {
    findById: vi.fn(),
    listActive: vi.fn().mockResolvedValue([]),
  };
  const gateway = {
    emitSlotStarted: vi.fn(),
    emitSlotTick: vi.fn(),
    emitSlotEnded: vi.fn(),
  };
  const service = new PrayerEngineService(slotsService as never, programsService as never, gateway as never);
  return { service, slotsService, programsService, gateway };
}

describe('PrayerEngineService', () => {
  describe('tick — transitioning expired slots', () => {
    it('does nothing when there are no expired slots', async () => {
      const { service, gateway } = buildDeps();

      await service.tick();

      expect(gateway.emitSlotEnded).not.toHaveBeenCalled();
      expect(gateway.emitSlotStarted).not.toHaveBeenCalled();
    });

    it('finishes an expired slot and activates the next one in the same program', async () => {
      const { service, slotsService, programsService, gateway } = buildDeps();
      const expiredSlot = buildSlot({ id: 'slot-1', order_index: 0 });
      const nextSlot = buildSlot({ id: 'slot-2', order_index: 1 });
      slotsService.findExpiredRunningSlots.mockResolvedValue([expiredSlot]);
      slotsService.findByOrderIndex.mockResolvedValue(nextSlot);
      slotsService.activate.mockResolvedValue({ ...nextSlot, status: 'RUNNING' });
      programsService.findById.mockResolvedValue(buildProgram());

      await service.tick();

      expect(slotsService.markFinished).toHaveBeenCalledWith('slot-1');
      expect(slotsService.findByOrderIndex).toHaveBeenCalledWith('program-1', 1);
      expect(slotsService.activate).toHaveBeenCalledWith('slot-2', 300);
      expect(gateway.emitSlotEnded).toHaveBeenCalledWith('community-1', 'slot-1');
      expect(gateway.emitSlotStarted).toHaveBeenCalledWith(
        'community-1',
        expect.objectContaining({ id: 'slot-2' }),
        300,
      );
    });

    it('loops back to the first slot when the expired slot was the last in the program — the room is never silent', async () => {
      const { service, slotsService, programsService, gateway } = buildDeps();
      const lastSlot = buildSlot({ id: 'slot-last', order_index: 12 });
      const firstSlot = buildSlot({ id: 'slot-1', order_index: 0 });
      slotsService.findExpiredRunningSlots.mockResolvedValue([lastSlot]);
      slotsService.findByOrderIndex.mockResolvedValue(null); // no slot at order_index 13
      slotsService.findFirstByProgram.mockResolvedValue(firstSlot);
      slotsService.activate.mockResolvedValue({ ...firstSlot, status: 'RUNNING' });
      programsService.findById.mockResolvedValue(buildProgram());

      await service.tick();

      expect(slotsService.findFirstByProgram).toHaveBeenCalledWith('program-1');
      expect(slotsService.activate).toHaveBeenCalledWith('slot-1', expect.any(Number));
      expect(gateway.emitSlotStarted).toHaveBeenCalledWith(
        'community-1',
        expect.objectContaining({ id: 'slot-1' }),
        expect.any(Number),
      );
    });

    it('logs and continues instead of throwing when transitioning one slot fails, so other slots still get processed', async () => {
      const { service, slotsService, programsService, gateway } = buildDeps();
      const brokenSlot = buildSlot({ id: 'slot-broken', program_id: 'program-broken' });
      const okSlot = buildSlot({ id: 'slot-ok', program_id: 'program-ok', order_index: 0 });
      const okNext = buildSlot({ id: 'slot-ok-2', program_id: 'program-ok', order_index: 1 });
      slotsService.findExpiredRunningSlots.mockResolvedValue([brokenSlot, okSlot]);
      programsService.findById.mockImplementation((id: string) =>
        id === 'program-broken' ? Promise.reject(new Error('db exploded')) : Promise.resolve(buildProgram({ id })),
      );
      slotsService.findByOrderIndex.mockResolvedValue(okNext);
      slotsService.activate.mockResolvedValue({ ...okNext, status: 'RUNNING' });

      await expect(service.tick()).resolves.toBeUndefined();

      expect(gateway.emitSlotStarted).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ id: 'slot-ok-2' }),
        expect.any(Number),
      );
    });

    it('computes the next slot duration from the expired slot window, not the next slot', async () => {
      const { service, slotsService, programsService } = buildDeps();
      const expiredSlot = buildSlot({
        id: 'slot-1',
        start_at: '2026-08-08T23:00:00.000Z',
        end_at: '2026-08-08T23:02:00.000Z', // 120s window
      });
      const nextSlot = buildSlot({ id: 'slot-2', order_index: 1 });
      slotsService.findExpiredRunningSlots.mockResolvedValue([expiredSlot]);
      slotsService.findByOrderIndex.mockResolvedValue(nextSlot);
      slotsService.activate.mockResolvedValue({ ...nextSlot, status: 'RUNNING' });
      programsService.findById.mockResolvedValue(buildProgram());

      await service.tick();

      expect(slotsService.activate).toHaveBeenCalledWith('slot-2', 120);
    });
  });

  describe('tick — broadcasting ticks for running slots', () => {
    it('skips a program that has no currently-running slot', async () => {
      const { service, programsService, slotsService, gateway } = buildDeps();
      programsService.listActive.mockResolvedValue([buildProgram()]);
      slotsService.findRunningSlotByProgram.mockResolvedValue(null);

      await service.tick();

      expect(gateway.emitSlotTick).not.toHaveBeenCalled();
    });

    it('emits the remaining seconds for a running slot, clamped to zero rather than negative', async () => {
      const { service, programsService, slotsService, gateway } = buildDeps();
      programsService.listActive.mockResolvedValue([buildProgram()]);
      slotsService.findRunningSlotByProgram.mockResolvedValue(
        buildSlot({ end_at: new Date(Date.now() - 5000).toISOString() }),
      );

      await service.tick();

      expect(gateway.emitSlotTick).toHaveBeenCalledWith('community-1', 0);
    });

    it('broadcasts independently for every active program', async () => {
      const { service, programsService, slotsService, gateway } = buildDeps();
      programsService.listActive.mockResolvedValue([
        buildProgram({ id: 'program-a', community_id: 'community-a' }),
        buildProgram({ id: 'program-b', community_id: 'community-b' }),
      ]);
      slotsService.findRunningSlotByProgram.mockResolvedValue(
        buildSlot({ end_at: new Date(Date.now() + 60000).toISOString() }),
      );

      await service.tick();

      expect(gateway.emitSlotTick).toHaveBeenCalledWith('community-a', expect.any(Number));
      expect(gateway.emitSlotTick).toHaveBeenCalledWith('community-b', expect.any(Number));
    });
  });
});
