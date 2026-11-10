import { PrayerEngineService, RELAY_GRACE_SECONDS } from './prayer-engine.service';

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
    nextAfter: vi.fn(),
    findFirstByProgram: vi.fn(),
    findById: vi.fn(),
    intendedDurationSeconds: vi.fn().mockResolvedValue(300),
    activate: vi.fn(async (id: string) => buildSlot({ id })),
    findRunningSlotByProgram: vi.fn().mockResolvedValue(null),
    findPlannedAt: vi.fn().mockResolvedValue(null),
    findNextPlanned: vi.fn().mockResolvedValue(null),
    findReplayBlock: vi.fn().mockResolvedValue([]),
    markRunning: vi.fn(async (id: string) => buildSlot({ id })),
  };
  const programsService = {
    findById: vi.fn().mockResolvedValue(buildProgram()),
    listActive: vi.fn().mockResolvedValue([]),
    scheduleMode: vi.fn().mockResolvedValue('LOOP'),
  };
  let shareHandler: ((roomId: string, sharer: unknown) => Promise<void>) | undefined;
  const relays = new Map<string, Record<string, unknown>>();
  const gateway = {
    emitSlotStarted: vi.fn(),
    emitSlotTick: vi.fn(),
    emitSlotEnded: vi.fn(),
    clearActiveSpeakers: vi.fn().mockReturnValue([]),
    onRelayShare: vi.fn((handler) => {
      shareHandler = handler;
    }),
    hasModerator: vi.fn().mockReturnValue(false),
    getPendingRelay: vi.fn((roomId: string) => relays.get(roomId)),
    openRelay: vi.fn((roomId: string, relay: Record<string, unknown>) => relays.set(roomId, relay)),
    closeRelay: vi.fn((roomId: string) => relays.delete(roomId)),
    setSharer: vi.fn(),
    replay: undefined as unknown,
    getReplay: vi.fn(function (this: { replay: unknown }) {
      return this.replay;
    }),
    setReplay: vi.fn(function (this: { replay: unknown }, _roomId: string, r: unknown) {
      this.replay = r ?? undefined;
    }),
  };
  const service = new PrayerEngineService(slotsService as never, programsService as never, gateway as never);
  return { service, slotsService, programsService, gateway, relays, share: (roomId: string, sharer: unknown) => (shareHandler as NonNullable<typeof shareHandler>)(roomId, sharer) };
}

describe('PrayerEngineService', () => {
  describe('inside a créneau', () => {
    it('does nothing when no segment has expired', async () => {
      const { service, gateway } = buildDeps();
      await service.tick();
      expect(gateway.emitSlotEnded).not.toHaveBeenCalled();
      expect(gateway.emitSlotStarted).not.toHaveBeenCalled();
    });

    it('moves straight to the next segment, which runs for its OWN duration', async () => {
      const { service, slotsService, gateway } = buildDeps();
      const louange = buildSlot({ id: 'slot-louange', order_index: 6, title: 'Louange intense' });
      const priere5 = buildSlot({ id: 'slot-p5', order_index: 7, title: 'Prière 5' });
      slotsService.findExpiredRunningSlots.mockResolvedValue([louange]);
      slotsService.nextAfter
        .mockResolvedValueOnce({ slot: priere5, wraps: false })
        .mockResolvedValue({ slot: buildSlot({ id: 'slot-p6', title: 'Prière 6' }), wraps: false });
      // Louange lasted 3 minutes; prayer 5 is meant to last 5. The old engine gave it 3.
      slotsService.intendedDurationSeconds.mockResolvedValue(300);

      await service.tick();

      expect(slotsService.markFinished).toHaveBeenCalledWith('slot-louange');
      expect(slotsService.intendedDurationSeconds).toHaveBeenCalledWith(priere5);
      expect(slotsService.activate).toHaveBeenCalledWith('slot-p5', 300);
      expect(gateway.clearActiveSpeakers).toHaveBeenCalledWith('community-1');
      expect(gateway.emitSlotStarted).toHaveBeenCalledWith(
        'community-1',
        expect.objectContaining({ id: 'slot-p5' }),
        300,
        { title: 'Prière 6', startsNewCreneau: false },
      );
      expect(gateway.openRelay).not.toHaveBeenCalled();
    });

    it('logs and keeps going when one transition fails', async () => {
      const { service, slotsService } = buildDeps();
      slotsService.findExpiredRunningSlots.mockResolvedValue([buildSlot({ id: 'a' }), buildSlot({ id: 'b' })]);
      slotsService.nextAfter
        .mockRejectedValueOnce(new Error('db hiccup'))
        .mockResolvedValue({ slot: buildSlot({ id: 'c' }), wraps: false });

      await expect(service.tick()).resolves.toBeUndefined();
      expect(slotsService.markFinished).toHaveBeenCalledWith('b');
    });
  });

  describe('relay at the end of a créneau', () => {
    function lastSegment(deps: ReturnType<typeof buildDeps>) {
      const closing = buildSlot({ id: 'slot-cloture', order_index: 12, title: 'Clôture et Bénédiction finale' });
      const opening = buildSlot({ id: 'slot-ouverture', order_index: 0, title: "Prière d'ouverture", status: 'FINISHED' });
      deps.slotsService.findExpiredRunningSlots.mockResolvedValue([closing]);
      deps.slotsService.nextAfter.mockResolvedValue({ slot: opening, wraps: true });
      deps.slotsService.findById.mockImplementation(async (id: string) => (id === closing.id ? closing : opening));
      return { closing, opening };
    }

    it('with no moderator connected, the AI shares the créneau at once — the prayer never stops', async () => {
      const deps = buildDeps();
      lastSegment(deps);

      await deps.service.tick();

      expect(deps.gateway.setSharer).toHaveBeenCalledWith('community-1', { kind: 'AI', displayName: null });
      expect(deps.slotsService.markFinished).toHaveBeenCalledWith('slot-cloture');
      expect(deps.slotsService.activate).toHaveBeenCalledWith('slot-ouverture', 300);
      expect(deps.gateway.openRelay).not.toHaveBeenCalled();
    });

    it('with a moderator connected, opens a relay and keeps the closing segment running', async () => {
      const deps = buildDeps();
      lastSegment(deps);
      deps.gateway.hasModerator.mockReturnValue(true);

      await deps.service.tick();

      expect(deps.gateway.openRelay).toHaveBeenCalledWith(
        'community-1',
        expect.objectContaining({ fromSlotId: 'slot-cloture', nextSlotId: 'slot-ouverture', nextTitle: "Prière d'ouverture" }),
      );
      const relay = deps.relays.get('community-1') as { deadline: number };
      expect(relay.deadline - Date.now()).toBeGreaterThan((RELAY_GRACE_SECONDS - 5) * 1000);
      expect(deps.slotsService.markFinished).not.toHaveBeenCalled();
      expect(deps.slotsService.activate).not.toHaveBeenCalled();
    });

    it('the moderator who clicks "Partager maintenant" shares it, signed with their name', async () => {
      const deps = buildDeps();
      lastSegment(deps);
      deps.gateway.hasModerator.mockReturnValue(true);
      await deps.service.tick();

      const moderator = { kind: 'MODERATOR', userId: 'u-paul', displayName: 'Pasteur Paul' };
      await deps.share('community-1', moderator);

      expect(deps.gateway.closeRelay).toHaveBeenCalledWith('community-1');
      expect(deps.gateway.setSharer).toHaveBeenCalledWith('community-1', moderator);
      expect(deps.slotsService.markFinished).toHaveBeenCalledWith('slot-cloture');
      expect(deps.slotsService.activate).toHaveBeenCalledWith('slot-ouverture', 300);
      // A second click arriving late does nothing.
      await deps.share('community-1', moderator);
      expect(deps.slotsService.activate).toHaveBeenCalledTimes(1);
    });

    it('waits while the relay is open, then the AI shares at the deadline', async () => {
      const deps = buildDeps();
      lastSegment(deps);
      deps.gateway.hasModerator.mockReturnValue(true);
      await deps.service.tick();

      await deps.service.tick();
      expect(deps.slotsService.activate).not.toHaveBeenCalled();

      (deps.relays.get('community-1') as { deadline: number }).deadline = Date.now() - 1;
      await deps.service.tick();

      expect(deps.gateway.setSharer).toHaveBeenLastCalledWith('community-1', { kind: 'AI', displayName: null });
      expect(deps.slotsService.activate).toHaveBeenCalledWith('slot-ouverture', 300);
    });

    it('if the last moderator leaves during the relay, the AI shares right away', async () => {
      const deps = buildDeps();
      lastSegment(deps);
      deps.gateway.hasModerator.mockReturnValue(true);
      await deps.service.tick();

      deps.gateway.hasModerator.mockReturnValue(false);
      await deps.service.tick();

      expect(deps.slotsService.activate).toHaveBeenCalledWith('slot-ouverture', 300);
    });
  });

  describe('continuity and ticks', () => {
    it('restarts a silent program from its first segment', async () => {
      const { service, slotsService, programsService, gateway } = buildDeps();
      programsService.listActive.mockResolvedValue([buildProgram()]);
      slotsService.findFirstByProgram.mockResolvedValue(buildSlot({ id: 'slot-first', status: 'SCHEDULED' }));
      slotsService.nextAfter.mockResolvedValue({ slot: buildSlot({ id: 'slot-2' }), wraps: false });

      await service.tick();

      expect(gateway.closeRelay).toHaveBeenCalledWith('community-1');
      expect(slotsService.activate).toHaveBeenCalledWith('slot-first', 300);
    });

    it('broadcasts the remaining seconds, clamped at zero, for every active program', async () => {
      const { service, slotsService, programsService, gateway } = buildDeps();
      programsService.listActive.mockResolvedValue([buildProgram(), buildProgram({ id: 'program-2', community_id: null })]);
      slotsService.findRunningSlotByProgram.mockResolvedValue(
        buildSlot({ end_at: new Date(Date.now() - 5000).toISOString() }),
      );

      await service.tick();

      expect(gateway.emitSlotTick).toHaveBeenCalledWith('community-1', 0);
      expect(gateway.emitSlotTick).toHaveBeenCalledWith('world', 0);
    });
  });

  describe('calendar mode: prayer programmed over a day, a week, a month', () => {
    const at = (min: number) => new Date(Date.now() + min * 60000).toISOString();
    function calendarDeps() {
      const deps = buildDeps();
      deps.programsService.listActive.mockResolvedValue([buildProgram()]);
      deps.programsService.scheduleMode.mockResolvedValue('CALENDAR');
      return deps;
    }

    it('starts the segment planned for now, keeping its planned hours, and announces the next one', async () => {
      const deps = calendarDeps();
      const planned = buildSlot({ id: 'h12-p1', status: 'SCHEDULED', title: 'Prière 1', start_at: at(-1), end_at: at(4) });
      deps.slotsService.findPlannedAt.mockResolvedValue(planned);
      deps.slotsService.markRunning.mockResolvedValue({ ...planned, status: 'RUNNING' });
      deps.slotsService.findNextPlanned.mockResolvedValue(buildSlot({ id: 'h12-p2', title: 'Prière 2', start_at: planned.end_at }));

      await deps.service.tick();

      expect(deps.slotsService.markRunning).toHaveBeenCalledWith('h12-p1');
      expect(deps.slotsService.activate).not.toHaveBeenCalled(); // never rewrites the planned hours
      expect(deps.gateway.setSharer).toHaveBeenCalledWith('community-1', { kind: 'PROGRAM', displayName: null });
      const [, , remaining, next] = deps.gateway.emitSlotStarted.mock.calls[0];
      expect(remaining).toBeGreaterThan(230);
      expect(next).toEqual({ title: 'Prière 2', startsNewCreneau: false });
      // The loop-mode machinery stays out of calendar programs.
      expect(deps.slotsService.findFirstByProgram).not.toHaveBeenCalled();
    });

    it('hands over to the next hour without a break', async () => {
      const deps = calendarDeps();
      const closing = buildSlot({ id: 'h12-close', status: 'RUNNING', end_at: at(0) });
      const opening = buildSlot({ id: 'h13-open', status: 'SCHEDULED', start_at: at(0), end_at: at(3) });
      deps.slotsService.findRunningSlotByProgram.mockResolvedValue(closing);
      deps.slotsService.findPlannedAt.mockResolvedValue(opening);

      await deps.service.tick();

      expect(deps.slotsService.markFinished).toHaveBeenCalledWith('h12-close');
      expect(deps.slotsService.markRunning).toHaveBeenCalledWith('h13-open');
    });

    it('in an hour nobody wrote, the AI carries on with the last créneau until the next planned one', async () => {
      const deps = calendarDeps();
      const block = [
        buildSlot({ id: 'b1', title: 'Ouverture', start_at: at(-60), end_at: at(-57) }),
        buildSlot({ id: 'b2', title: 'Prière 1', start_at: at(-57), end_at: at(-52) }),
      ];
      deps.slotsService.findReplayBlock.mockResolvedValue(block);
      deps.slotsService.intendedDurationSeconds.mockResolvedValue(180);
      deps.slotsService.findNextPlanned.mockResolvedValue(buildSlot({ id: 'h14', title: 'Ouverture 14h', start_at: at(2) }));

      await deps.service.tick();

      expect(deps.gateway.setSharer).toHaveBeenLastCalledWith('community-1', { kind: 'AI', displayName: null });
      const [, slot, remaining, next] = deps.gateway.emitSlotStarted.mock.calls[0];
      expect(slot).toMatchObject({ id: 'b1', status: 'RUNNING' });
      // Cut at the next planned créneau (2 min), not its own 3 minutes.
      expect(remaining).toBeLessThanOrEqual(120);
      expect(next).toEqual({ title: 'Ouverture 14h', startsNewCreneau: true });
      expect(deps.slotsService.markRunning).not.toHaveBeenCalled(); // nothing written to the calendar

      // Still within that replayed segment: nothing new is started.
      await deps.service.tick();
      expect(deps.gateway.emitSlotStarted).toHaveBeenCalledTimes(1);
    });

    it('a calendar with no créneau yet stays quiet instead of failing', async () => {
      const deps = calendarDeps();
      await expect(deps.service.tick()).resolves.toBeUndefined();
      expect(deps.gateway.emitSlotStarted).not.toHaveBeenCalled();
    });
  });
});
