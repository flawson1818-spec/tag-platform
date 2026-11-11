import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { MobilizationsService } from './mobilizations.service';

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
    for (const op of ['select', 'insert', 'update', 'delete', 'eq', 'is', 'in', 'not', 'order', 'limit']) {
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

const ROW = {
  id: 'm1',
  status: 'INVITED',
  note: null,
  invited_by: 'admin',
  created_at: '2026-11-11T00:00:00Z',
  updated_at: '2026-11-11T00:00:00Z',
  prayer_request_id: 'r1',
  community_id: 'c1',
  community: { id: 'c1', name: 'Église de la Grâce', type: 'CHURCH' },
  request: { id: 'r1', category: 'Maladie', description: 'Guérison', status: 'ASSIGNED' },
};

function build(responses: Record<string, Result[]>, perms: { global?: string[]; community?: string[] } = {}) {
  const db = fakeDb(responses);
  const permissions = {
    getUserPermissionCodes: vi.fn(async (_u: string, communityId?: string) => new Set(communityId ? (perms.community ?? []) : (perms.global ?? []))),
  };
  const notifications = { create: vi.fn().mockResolvedValue(null) };
  const service = new MobilizationsService(db as never, permissions as never, notifications as never);
  return { service, db, notifications };
}

describe('MobilizationsService', () => {
  it('lets the administration invite a group, and tells its leaders', async () => {
    const { service, notifications } = build(
      {
        prayer_requests: [{ data: { id: 'r1' } }],
        communities: [{ data: { id: 'c1' } }],
        prayer_request_mobilizations: [{ data: ROW }],
        community_members: [{ data: [{ user_id: 'leader' }] }],
      },
      { global: ['prayer_request.manage_status'] },
    );
    const m = await service.invite('r1', 'c1', 'admin');
    expect(m).toMatchObject({ status: 'INVITED', community: { name: 'Église de la Grâce' } });
    expect(m.request).not.toHaveProperty('author_id');
    await new Promise((r) => setTimeout(r, 0));
    expect(notifications.create).toHaveBeenCalledWith('leader', 'PRAYER_MOBILIZATION_INVITED', expect.objectContaining({ communityId: 'c1' }));
  });

  it('refuses to invite without the right, and twice the same group', async () => {
    await expect(build({}).service.invite('r1', 'c1', 'u')).rejects.toBeInstanceOf(ForbiddenException);
    const twice = build(
      {
        prayer_requests: [{ data: { id: 'r1' } }],
        communities: [{ data: { id: 'c1' } }],
        prayer_request_mobilizations: [{ error: { code: '23505', message: 'dup' } }],
      },
      { global: ['prayer_request.manage_status'] },
    );
    await expect(twice.service.invite('r1', 'c1', 'admin')).rejects.toBeInstanceOf(ConflictException);
  });

  it("lets only the group's leaders answer, in order", async () => {
    const member = build({ prayer_request_mobilizations: [{ data: ROW }] });
    await expect(member.service.answer('m1', 'ACCEPTED', 'u')).rejects.toBeInstanceOf(ForbiddenException);

    const leader = build({ prayer_request_mobilizations: [{ data: ROW }, { data: { ...ROW, status: 'ACCEPTED' } }] }, { community: ['community.manage'] });
    await expect(leader.service.answer('m1', 'DONE', 'leader')).rejects.toBeInstanceOf(BadRequestException);
    const accepted = await build(
      { prayer_request_mobilizations: [{ data: ROW }, { data: { ...ROW, status: 'ACCEPTED' } }] },
      { community: ['community.manage'] },
    ).service.answer('m1', 'ACCEPTED', 'leader');
    expect(accepted.status).toBe('ACCEPTED');
  });

  it('shows members only what their group accepted', async () => {
    const { service, db } = build({ community_members: [{ data: { status: 'ACTIVE' } }], prayer_request_mobilizations: [{ data: [] }] });
    const res = await service.listForCommunity('c1', 'u');
    expect(res.canAnswer).toBe(false);
    const q = db.calls.find((c) => c.table === 'prayer_request_mobilizations');
    expect(q?.ops).toContainEqual(['in', ['status', ['ACCEPTED', 'DONE']]]);

    const outsider = build({ community_members: [{ data: null }] });
    expect((await outsider.service.listForCommunity('c1', 'x')).items).toEqual([]);
  });
});
