vi.hoisted(() => {
  process.env.PRAYER_WORSHIP_SECONDS = '300';
  process.env.PRAYER_WORSHIP_GAP_MAX_SECONDS = '1800';
});
import { PrayerEngineService } from './prayer-engine.service';

const T = (iso: string) => new Date(iso).getTime();

function slot(overrides: Record<string, unknown> = {}) {
  return {
    id: 'slot-1',
    program_id: 'program-1',
    order_index: 0,
    title: 'Prière 1',
    start_at: '2026-11-11T12:00:00.000Z',
    end_at: '2026-11-11T12:05:00.000Z',
    status: 'RUNNING',
    ...overrides,
  };
}

function deps(mode: 'LOOP' | 'CALENDAR') {
  const program = { id: 'program-1', community_id: null, status: 'ACTIVE', created_at: '2026-11-01T00:00:00Z' };
  const slotsService = {
    findExpiredRunningSlots: vi.fn().mockResolvedValue([]),
    markFinished: vi.fn().mockResolvedValue(undefined),
    nextAfter: vi.fn(),
    findFirstByProgram: vi.fn(),
    findById: vi.fn(),
    intendedDurationSeconds: vi.fn().mockResolvedValue(300),
    activate: vi.fn(async (id: string) => slot({ id })),
    findRunningSlotByProgram: vi.fn().mockResolvedValue(null),
    findPlannedAt: vi.fn().mockResolvedValue(null),
    findNextPlanned: vi.fn().mockResolvedValue(null),
    findReplayBlock: vi.fn().mockResolvedValue([]),
    markRunning: vi.fn(async (id: string) => slot({ id })),
  };
  const programsService = {
    findById: vi.fn().mockResolvedValue(program),
    listRoomPrograms: vi.fn().mockResolvedValue({ driving: [program], superseded: [] }),
    scheduleMode: vi.fn().mockResolvedValue(mode),
    nextWorshipTrack: vi.fn().mockResolvedValue({ provider: 'youtube', videoId: 'abcdefghijk', embedUrl: 'https://www.youtube.com/embed/abcdefghijk?autoplay=1' }),
  };
  const state: { interlude?: { slot: { id: string; end_at: string; kind: string }; fromSlotId?: string }; replay?: unknown } = {};
  const gateway = {
    emitSlotStarted: vi.fn(),
    emitSlotTick: vi.fn(),
    emitSlotEnded: vi.fn(),
    clearActiveSpeakers: vi.fn(),
    onRelayShare: vi.fn(),
    hasModerator: vi.fn().mockReturnValue(false),
    getPendingRelay: vi.fn(),
    openRelay: vi.fn(),
    closeRelay: vi.fn(),
    setSharer: vi.fn(),
    getReplay: vi.fn(() => state.replay),
    setReplay: vi.fn((_r: string, v: unknown) => (state.replay = v ?? undefined)),
    getInterlude: vi.fn(() => state.interlude),
    setInterlude: vi.fn((_r: string, v: typeof state.interlude | null) => (state.interlude = v ?? undefined)),
    startWorshipMusic: vi.fn(),
    getTakeover: vi.fn(),
    endTakeover: vi.fn(),
    stopWorshipMusic: vi.fn(),
  };
  const service = new PrayerEngineService(slotsService as never, programsService as never, gateway as never);
  return { service, slotsService, programsService, gateway, state };
}

const startedTitles = (gateway: { emitSlotStarted: { mock: { calls: unknown[][] } } }) =>
  gateway.emitSlotStarted.mock.calls.map((c) => (c[1] as { title: string }).title);

describe('PrayerEngineService — praise between two sections', () => {
  afterEach(() => vi.useRealTimers());

  it('loop: at the end of a créneau, praise with music, then the next créneau', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T('2026-11-11T12:05:01Z'));
    const { service, slotsService, gateway } = deps('LOOP');
    const closing = slot({ id: 'closing', title: 'Clôture' });
    const opening = slot({ id: 'opening', title: "Prière d'ouverture", status: 'FINISHED' });
    slotsService.findExpiredRunningSlots.mockResolvedValue([closing]);
    slotsService.findRunningSlotByProgram.mockResolvedValue(closing);
    slotsService.nextAfter.mockResolvedValue({ slot: opening, wraps: true });

    await service.tick();
    expect(startedTitles(gateway)).toEqual(['Temps de louange']);
    expect(gateway.emitSlotStarted.mock.calls[0][1]).toMatchObject({ kind: 'WORSHIP' });
    expect(gateway.startWorshipMusic).toHaveBeenCalledWith('world', expect.objectContaining({ videoId: 'abcdefghijk' }));
    expect(slotsService.activate).not.toHaveBeenCalled();

    vi.setSystemTime(T('2026-11-11T12:08:00Z'));
    await service.tick();
    expect(slotsService.activate).not.toHaveBeenCalled(); // the praise goes on

    vi.setSystemTime(T('2026-11-11T12:10:02Z'));
    await service.tick();
    expect(gateway.stopWorshipMusic).toHaveBeenCalled();
    expect(slotsService.markFinished).toHaveBeenCalledWith('closing');
    expect(slotsService.activate).toHaveBeenCalledWith('opening', 300);
  });

  it('calendar: the last minutes before a new hour of prayer are praise', async () => {
    vi.useFakeTimers();
    const { service, slotsService, gateway, state } = deps('CALENDAR');
    const closing = slot({ id: 'closing', title: 'Clôture', start_at: '2026-11-11T12:50:00Z', end_at: '2026-11-11T13:00:00Z' });
    const nextHour = slot({ id: 'next', title: "Prière d'ouverture", start_at: '2026-11-11T13:00:00Z', end_at: '2026-11-11T13:05:00Z', status: 'SCHEDULED' });
    slotsService.findRunningSlotByProgram.mockResolvedValue(closing);
    slotsService.findPlannedAt.mockResolvedValue(closing);
    slotsService.findNextPlanned.mockResolvedValue(nextHour);

    vi.setSystemTime(T('2026-11-11T12:52:00Z'));
    await service.tick();
    expect(gateway.emitSlotStarted).not.toHaveBeenCalled();

    vi.setSystemTime(T('2026-11-11T12:55:00Z'));
    await service.tick();
    expect(startedTitles(gateway)).toEqual(['Temps de louange']);
    expect(state.interlude?.slot.end_at).toBe('2026-11-11T13:00:00.000Z');

    vi.setSystemTime(T('2026-11-11T13:00:01Z'));
    slotsService.findPlannedAt.mockResolvedValue(nextHour);
    await service.tick();
    expect(gateway.stopWorshipMusic).toHaveBeenCalled();
    expect(slotsService.markRunning).toHaveBeenCalledWith('next');
    expect(state.interlude).toBeUndefined();
  });

  it('calendar: a short gap before the next section is filled with praise, not a replay', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T('2026-11-11T12:53:00Z'));
    const { service, slotsService, gateway, state } = deps('CALENDAR');
    slotsService.findNextPlanned.mockResolvedValue(slot({ id: 'next', title: 'Ouverture', start_at: '2026-11-11T13:00:00Z', status: 'SCHEDULED' }));
    await service.tick();
    expect(startedTitles(gateway)).toEqual(['Temps de louange']);
    expect(state.interlude?.slot.end_at).toBe('2026-11-11T13:00:00.000Z');
    expect(slotsService.findReplayBlock).not.toHaveBeenCalled();
  });

  it('an older active program of the same room is silenced', async () => {
    const { service, slotsService, programsService } = deps('LOOP');
    programsService.listRoomPrograms.mockResolvedValue({ driving: [], superseded: [{ id: 'old', community_id: null }] });
    slotsService.findRunningSlotByProgram.mockResolvedValue(slot({ id: 'old-slot', program_id: 'old' }));
    await service.tick();
    expect(slotsService.markFinished).toHaveBeenCalledWith('old-slot');
  });

  it('never runs two ticks at once', async () => {
    const { service, programsService } = deps('LOOP');
    await Promise.all([service.tick(), service.tick()]);
    expect(programsService.listRoomPrograms).toHaveBeenCalledTimes(1);
  });
});
