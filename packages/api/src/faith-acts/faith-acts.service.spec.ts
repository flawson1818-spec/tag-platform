import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { FaithActsService } from './faith-acts.service';

type Result = { data?: unknown; error?: { code?: string; message: string } | null };

function fakeDb(responses: Record<string, Result[]>) {
  const calls: { table: string; ops: [string, unknown[]][] }[] = [];
  const from = (table: string) => {
    const entry = { table, ops: [] as [string, unknown[]][] };
    calls.push(entry);
    const next = () => {
      const queue = responses[table] ?? [];
      const r = queue.length > 1 ? queue.shift() : queue[0];
      return Promise.resolve({ data: null, error: null, ...(r ?? {}) });
    };
    const b: Record<string, unknown> = {};
    for (const op of ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'neq', 'in', 'order', 'limit']) {
      b[op] = (...args: unknown[]) => {
        entry.ops.push([op, args]);
        return b;
      };
    }
    b.single = () => next();
    b.maybeSingle = () => next();
    b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => next().then(res, rej);
    return b;
  };
  return { client: { from }, calls };
}

const ACT = {
  id: 'a1',
  user_id: 'u1',
  kind: 'FAST',
  title: '3 jours de jeûne pour ma famille',
  description: null,
  start_date: '2026-11-13',
  end_date: '2026-11-15',
  is_public: true,
  status: 'ACTIVE',
  fulfilled_at: null,
  testimony_id: null,
  created_at: '2026-11-13T00:00:00Z',
};

function build(responses: Record<string, Result[]>) {
  const db = fakeDb(responses);
  const testimonies = { create: vi.fn().mockResolvedValue({ id: 't1' }) };
  return { service: new FaithActsService(db as never, testimonies as never), db, testimonies };
}

describe('FaithActsService', () => {
  it("shows another member's public acts only, never the abandoned ones", async () => {
    const { service, db } = build({ faith_acts: [{ data: [ACT] }], faith_act_supports: [{ data: [{ act_id: 'a1', user_id: 'u2' }] }] });
    const list = await service.listFor('u1', 'u2');
    expect(list[0]).toMatchObject({ supportCount: 1, supportedByMe: true, mine: false });
    const ops = db.calls.find((c) => c.table === 'faith_acts')?.ops;
    expect(ops).toContainEqual(['eq', ['is_public', true]]);
    expect(ops).toContainEqual(['neq', ['status', 'ABANDONED']]);
  });

  it('turns a fulfilled act into a testimony waiting for moderation', async () => {
    const { service, testimonies } = build({
      faith_acts: [{ data: ACT }, { data: { ...ACT, status: 'FULFILLED', testimony_id: 't1' } }],
      faith_act_supports: [{ data: [] }],
    });
    const act = await service.update('a1', 'u1', { status: 'FULFILLED', testimony: 'Ma sœur a été guérie.' });
    expect(testimonies.create).toHaveBeenCalledWith(
      { mediaType: 'TEXT', content: '3 jours de jeûne pour ma famille\n\nMa sœur a été guérie.' },
      'u1',
    );
    expect(act).toMatchObject({ status: 'FULFILLED', testimonyId: 't1' });
  });

  it("refuses to touch someone else's act, or to close one twice", async () => {
    await expect(build({ faith_acts: [{ data: ACT }] }).service.update('a1', 'u2', { status: 'ABANDONED' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      build({ faith_acts: [{ data: { ...ACT, status: 'FULFILLED' } }] }).service.update('a1', 'u1', { status: 'ABANDONED' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lets others support an act, but not its author', async () => {
    await expect(build({ faith_acts: [{ data: ACT }] }).service.support('a1', 'u1', true)).rejects.toBeInstanceOf(BadRequestException);
    const { service } = build({ faith_acts: [{ data: ACT }], faith_act_supports: [{ data: null }, { data: [{ act_id: 'a1', user_id: 'u2' }] }] });
    await expect(service.support('a1', 'u2', true)).resolves.toEqual({ supportCount: 1, supportedByMe: true });
  });
});
