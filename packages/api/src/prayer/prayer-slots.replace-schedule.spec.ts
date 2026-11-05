import { PrayerSlotsService } from './prayer-slots.service';

type Row = Record<string, unknown>;

/** A tiny in-memory stand-in for the prayer_slots table: enough PostgREST to run real logic. */
function fakeSupabase(initial: Row[]) {
  const rows = initial.map((r) => ({ ...r }));
  let seq = 100;
  const deleted: string[] = [];

  function builder() {
    let op: 'select' | 'update' | 'insert' | 'delete' = 'select';
    let patch: Row = {};
    let inserted: Row | null = null;
    const filters: ((r: Row) => boolean)[] = [];
    let orderKey: string | null = null;
    let ascending = true;
    let limit: number | null = null;

    const run = () => {
      if (op === 'insert') {
        const row = { id: `new-${seq++}`, status: 'SCHEDULED', leader_user_id: null, leader: null, ...inserted };
        rows.push(row);
        return { data: row, error: null };
      }
      let matched = rows.filter((r) => filters.every((f) => f(r)));
      if (op === 'update') {
        matched.forEach((r) => Object.assign(r, patch));
        return { data: matched, error: null };
      }
      if (op === 'delete') {
        matched.forEach((r) => {
          deleted.push(r.id as string);
          rows.splice(rows.indexOf(r), 1);
        });
        return { data: null, error: null };
      }
      if (orderKey) {
        const k = orderKey;
        matched = [...matched].sort((a, b) => ((a[k] as number) - (b[k] as number)) * (ascending ? 1 : -1));
      }
      if (limit !== null) matched = matched.slice(0, limit);
      return { data: matched.map((r) => ({ ...r, leader: null })), error: null };
    };

    const chain: Record<string, unknown> = {
      select: () => chain,
      update: (p: Row) => ((op = 'update'), (patch = p), chain),
      insert: (r: Row) => ((op = 'insert'), (inserted = r), chain),
      delete: () => ((op = 'delete'), chain),
      eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), chain),
      neq: (k: string, v: unknown) => (filters.push((r) => r[k] !== v), chain),
      gt: (k: string, v: number) => (filters.push((r) => (r[k] as number) > v), chain),
      order: (k: string, o?: { ascending?: boolean }) => ((orderKey = k), (ascending = o?.ascending ?? true), chain),
      limit: (n: number) => ((limit = n), chain),
      single: () => Promise.resolve(((r) => ({ ...r, data: Array.isArray(r.data) ? r.data[0] : r.data }))(run())),
      maybeSingle: () => Promise.resolve(((r) => ({ ...r, data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data }))(run())),
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
    };
    return chain;
  }

  return { client: { from: () => builder() }, rows, deleted };
}

function slot(id: string, order: number, status = 'FINISHED', extra: Row = {}): Row {
  return {
    id,
    program_id: 'p1',
    order_index: order,
    title: `Ancien ${order}`,
    category: 'Autre',
    importance: 'Normal',
    start_at: '2026-11-05T10:00:00.000Z',
    end_at: '2026-11-05T10:05:00.000Z',
    guided_text: null,
    bible_references: [],
    recommended_songs: [],
    leader_user_id: null,
    status,
    duration_seconds: null,
    ...extra,
  };
}

const segment = (title: string, minutes: number, extra: Record<string, unknown> = {}) => ({
  title,
  durationSeconds: minutes * 60,
  ...extra,
});

describe('PrayerSlotsService.replaceSchedule', () => {
  it('reuses existing segment rows in order, never deleting them (prayer hours stay)', async () => {
    const db = fakeSupabase([slot('a', 0), slot('b', 1, 'RUNNING'), slot('c', 2)]);
    const service = new PrayerSlotsService(db as never);

    const result = await service.replaceSchedule('p1', [
      segment("Prière d'ouverture", 3),
      segment('Prière 1', 5, { guidedText: 'Père merci…', bibleReferences: ['Jean 10:10 — Le voleur…'] }),
      segment('Clôture', 2),
    ]);

    expect(db.deleted).toEqual([]);
    expect(result.map((s) => [s.id, s.order_index, s.title])).toEqual([
      ['a', 0, "Prière d'ouverture"],
      ['b', 1, 'Prière 1'],
      ['c', 2, 'Clôture'],
    ]);
    const b = db.rows.find((r) => r.id === 'b') as Row;
    expect(b.status).toBe('RUNNING'); // the live segment keeps running…
    expect(b.end_at).toBe('2026-11-05T10:05:00.000Z'); // …in its live window
    expect(b.guided_text).toBe('Père merci…'); // but shows its new text at once
    expect(b.duration_seconds).toBe(300);
    const a = db.rows.find((r) => r.id === 'a') as Row;
    expect(a.status).toBe('SCHEDULED');
    expect(a.duration_seconds).toBe(180);
  });

  it('adds rows for a longer créneau and archives the surplus of a shorter one', async () => {
    const longer = fakeSupabase([slot('a', 0)]);
    const added = await new PrayerSlotsService(longer as never).replaceSchedule('p1', [
      segment('Ouverture', 3),
      segment('Adoration', 7),
    ]);
    expect(added.map((s) => s.title)).toEqual(['Ouverture', 'Adoration']);
    expect(added.map((s) => s.order_index)).toEqual([0, 1]);

    const shorter = fakeSupabase([slot('a', 0), slot('b', 1), slot('c', 2)]);
    const kept = await new PrayerSlotsService(shorter as never).replaceSchedule('p1', [segment('Seul segment', 10)]);
    expect(kept.map((s) => s.id)).toEqual(['a']);
    expect(shorter.rows.filter((r) => r.status === 'ARCHIVED').map((r) => r.id).sort()).toEqual(['b', 'c']);
    expect(shorter.deleted).toEqual([]);
  });

  it('brings archived rows back before creating new ones', async () => {
    const db = fakeSupabase([slot('a', 0), slot('z', 50, 'ARCHIVED')]);
    const result = await new PrayerSlotsService(db as never).replaceSchedule('p1', [segment('Un', 5), segment('Deux', 5)]);
    expect(result.map((s) => s.id)).toEqual(['a', 'z']);
    expect(db.rows).toHaveLength(2);
  });

  it('refuses an empty créneau', async () => {
    const db = fakeSupabase([slot('a', 0)]);
    await expect(new PrayerSlotsService(db as never).replaceSchedule('p1', [])).rejects.toThrow('au moins un segment');
  });
});

describe('PrayerSlotsService segment helpers', () => {
  it('nextAfter skips archived segments and flags the wrap to the first one as the relay', async () => {
    const db = fakeSupabase([slot('a', 0), slot('b', 1, 'ARCHIVED'), slot('c', 2)]);
    const service = new PrayerSlotsService(db as never);
    const a = await service.findById('a');
    const c = await service.findById('c');

    await expect(service.nextAfter(a)).resolves.toMatchObject({ slot: { id: 'c' }, wraps: false });
    await expect(service.nextAfter(c)).resolves.toMatchObject({ slot: { id: 'a' }, wraps: true });
  });

  it('intendedDurationSeconds prefers the stored duration, else the segment\'s own window', async () => {
    const db = fakeSupabase([slot('a', 0, 'FINISHED', { duration_seconds: 420 }), slot('b', 1)]);
    const service = new PrayerSlotsService(db as never);
    await expect(service.intendedDurationSeconds(await service.findById('a'))).resolves.toBe(420);
    await expect(service.intendedDurationSeconds(await service.findById('b'))).resolves.toBe(300);
  });
});
