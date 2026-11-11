vi.hoisted(() => {
  process.env.PRAYER_WORSHIP_SECONDS = '0';
});
import { PrayerEngineService } from './prayer-engine.service';

describe('PrayerEngineService — a moderator takes the room back', () => {
  function deps(takeoverEnd: number) {
    const program = { id: 'program-1', community_id: null, status: 'ACTIVE', created_at: '2026-11-01T00:00:00Z' };
    const takeover = { slot: { id: 'live-1', end_at: new Date(takeoverEnd).toISOString() } };
    let current: typeof takeover | undefined = takeover;
    const gateway = {
      onRelayShare: vi.fn(),
      emitSlotTick: vi.fn(),
      getTakeover: vi.fn(() => current),
      endTakeover: vi.fn(() => (current = undefined)),
      getInterlude: vi.fn(),
      getReplay: vi.fn(),
      closeRelay: vi.fn(),
    };
    const slotsService = {
      findExpiredRunningSlots: vi.fn().mockResolvedValue([]),
      findRunningSlotByProgram: vi.fn().mockResolvedValue({ id: 'planned', end_at: new Date(Date.now() + 60_000).toISOString() }),
    };
    const programsService = {
      listRoomPrograms: vi.fn().mockResolvedValue({ driving: [program], superseded: [] }),
      scheduleMode: vi.fn().mockResolvedValue('LOOP'),
    };
    const service = new PrayerEngineService(slotsService as never, programsService as never, gateway as never);
    return { service, gateway };
  }

  it('shows the live prayer time while the moderator leads', async () => {
    const { service, gateway } = deps(Date.now() + 30 * 60_000);
    await service.tick();
    expect(gateway.endTakeover).not.toHaveBeenCalled();
    expect(gateway.emitSlotTick).toHaveBeenCalledWith('world', 1800);
  });

  it('gives the room back to the program when the chosen time is over', async () => {
    const { service, gateway } = deps(Date.now() - 1000);
    await service.tick();
    expect(gateway.endTakeover).toHaveBeenCalledWith('world');
    expect(gateway.emitSlotTick).toHaveBeenCalledWith('world', 60);
  });
});
