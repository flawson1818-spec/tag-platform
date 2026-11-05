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
  };
  const programsService = {
    findById: vi.fn().mockResolvedValue(buildProgram()),
    listActive: vi.fn().mockResolvedValue([]),
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
});
