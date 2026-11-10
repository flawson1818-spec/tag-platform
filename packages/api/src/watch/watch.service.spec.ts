import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { createQueryChain, createSupabaseServiceMock } from '../testing/supabase-query-mock';
import { DEFAULT_CHECKLIST, localDay, WatchService } from './watch.service';

const FLAMBEAU_ROW = {
  day: '2026-11-10',
  guardian_id: 'g-1',
  checklist: DEFAULT_CHECKLIST.map((label) => ({ label, done: false })),
  encouragement: null,
  guardian: { display_name: 'Pasteur Paul' },
};

describe('WatchService', () => {
  it("knows today's date where the world room keeps watch", () => {
    expect(localDay(new Date('2026-11-10T23:30:00Z'), 'Africa/Lome')).toBe('2026-11-10');
    expect(localDay(new Date('2026-11-10T23:30:00Z'), 'Europe/Paris')).toBe('2026-11-11');
  });

  it("shows today's intention and Flambeau, and nothing invented when the day isn't prepared", async () => {
    const supabase = createSupabaseServiceMock({
      world_prayer_intentions: createQueryChain({ data: null, error: null }),
      flambeau_assignments: createQueryChain({ data: FLAMBEAU_ROW, error: null }),
    });
    const today = await new WatchService(supabase as never).today();
    expect(today.intention).toBeNull();
    expect(today.flambeau).toMatchObject({ guardian: { id: 'g-1', displayName: 'Pasteur Paul' } });
    expect(today.flambeau?.checklist).toHaveLength(5);
  });

  it('stays quiet before the migration', async () => {
    const missing = createQueryChain({ data: null, error: { code: '42P01', message: 'missing' } });
    const supabase = createSupabaseServiceMock({ world_prayer_intentions: missing, flambeau_assignments: missing });
    await expect(new WatchService(supabase as never).today()).resolves.toMatchObject({ intention: null, flambeau: null });
    await expect(
      new WatchService(supabase as never).setIntention('2026-11-10', { title: 'Pour les nations' }, 'a-1'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('names a guardian with the default watch list', async () => {
    const flambeaux = createQueryChain({ data: null, error: null });
    const supabase = createSupabaseServiceMock({
      users: createQueryChain({ data: { id: 'g-1' }, error: null }),
      flambeau_assignments: [flambeaux, flambeaux, createQueryChain({ data: FLAMBEAU_ROW, error: null })],
    });
    const result = await new WatchService(supabase as never).setFlambeau('2026-11-10', { guardianId: 'g-1' }, 'a-1');
    expect(flambeaux.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ day: '2026-11-10', guardian_id: 'g-1', checklist: FLAMBEAU_ROW.checklist }),
      { onConflict: 'day' },
    );
    expect(result.guardian.id).toBe('g-1');
  });

  it('only the guardian (or the administration) ticks the list', async () => {
    const supabase = createSupabaseServiceMock({ flambeau_assignments: createQueryChain({ data: FLAMBEAU_ROW, error: null }) });
    const service = new WatchService(supabase as never);
    await expect(service.updateFlambeau('2026-11-10', { item: 0, done: true }, 'someone', false)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.updateFlambeau('2026-11-10', { item: 0, done: true }, 'g-1', false)).resolves.toBeDefined();
  });

  it('refuses a malformed day', async () => {
    const service = new WatchService(createSupabaseServiceMock({}) as never);
    await expect(service.setIntention('10/11/2026', { title: 'x' }, 'a')).rejects.toThrow('Date invalide');
  });
});
