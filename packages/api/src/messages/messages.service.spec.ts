import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { MessagesService } from './messages.service';

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
    const builder: Record<string, unknown> = {};
    for (const op of ['select', 'insert', 'upsert', 'update', 'delete', 'eq', 'is', 'not', 'or', 'in', 'lt', 'order', 'limit']) {
      builder[op] = (...args: unknown[]) => {
        entry.ops.push([op, args]);
        return builder;
      };
    }
    builder.single = () => next();
    builder.maybeSingle = () => next();
    builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => next().then(resolve, reject);
    return builder;
  };
  return { client: { from }, calls };
}

const ME = 'aaaaaaaa-0000-0000-0000-000000000001';
const PAUL = 'bbbbbbbb-0000-0000-0000-000000000002';
const CONV = { id: 'c1', user_a: ME, user_b: PAUL, created_at: '2026-11-06T09:00:00Z', last_message_at: null, user_a_read_at: null, user_b_read_at: null };

function build(responses: Record<string, Result[]>) {
  const db = fakeDb(responses);
  const gateway = { emitMessage: vi.fn(), emitRead: vi.fn() };
  const files = { getPublicReadUrls: vi.fn().mockResolvedValue(new Map()) };
  return { service: new MessagesService(db as never, files as never, gateway as never), db, gateway };
}

describe('MessagesService', () => {
  it('refuses a conversation with myself', async () => {
    const { service } = build({});
    await expect(service.open(ME, ME)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('stores each pair once, smallest id first, whoever opens it', async () => {
    const { service, db } = build({
      users: [{ data: { id: ME, display_name: 'Lawson', avatar_file_id: null } }, { data: [{ id: ME, display_name: 'Lawson', avatar_file_id: null }] }],
      conversations: [{ data: null }, { data: CONV }],
    });
    const summary = await service.open(PAUL, ME);
    const upsert = db.calls.find((c) => c.table === 'conversations')?.ops.find(([op]) => op === 'upsert');
    expect(upsert?.[1][0]).toEqual({ user_a: ME, user_b: PAUL });
    expect(summary.peer.id).toBe(ME);
  });

  it("hides someone else's conversation as not found", async () => {
    const stranger = 'cccccccc-0000-0000-0000-000000000003';
    const { service } = build({ conversations: [{ data: CONV }] });
    await expect(service.listMessages(stranger, 'c1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('delivers a message live to both members and marks it read for the sender', async () => {
    const message = { id: 'm1', conversation_id: 'c1', sender_id: ME, content: 'Shalom Paul', created_at: '2026-11-06T10:00:00Z' };
    const { service, db, gateway } = build({
      conversations: [{ data: CONV }, { data: null }],
      user_blocks: [{ data: [] }],
      direct_messages: [{ data: message }],
    });
    const sent = await service.send(ME, 'c1', '  Shalom Paul  ');

    expect(sent.content).toBe('Shalom Paul');
    expect(gateway.emitMessage).toHaveBeenCalledWith([ME, PAUL], expect.objectContaining({ id: 'm1' }));
    const update = db.calls.filter((c) => c.table === 'conversations').flatMap((c) => c.ops).find(([op]) => op === 'update');
    expect(update?.[1][0]).toEqual({ last_message_at: message.created_at, user_a_read_at: message.created_at });
  });

  it('a blocked member cannot write, in either direction', async () => {
    const blockedByPaul = build({ conversations: [{ data: CONV }], user_blocks: [{ data: [{ blocker_id: PAUL, blocked_id: ME }] }] });
    await expect(blockedByPaul.service.send(ME, 'c1', 'Bonjour')).rejects.toBeInstanceOf(ForbiddenException);
    const blockedByMe = build({ conversations: [{ data: CONV }], user_blocks: [{ data: [{ blocker_id: ME, blocked_id: PAUL }] }] });
    await expect(blockedByMe.service.send(ME, 'c1', 'Bonjour')).rejects.toBeInstanceOf(ForbiddenException);
    expect(blockedByMe.gateway.emitMessage).not.toHaveBeenCalled();
  });

  it('counts unread messages from the other member only, after my last read', async () => {
    const conv = { ...CONV, last_message_at: '2026-11-06T10:05:00Z', user_a_read_at: '2026-11-06T10:01:00Z' };
    const { service } = build({
      conversations: [{ data: [conv] }],
      users: [{ data: [{ id: PAUL, display_name: 'Pasteur Paul', avatar_file_id: null }] }],
      direct_messages: [
        {
          data: [
            { id: 'm4', conversation_id: 'c1', sender_id: PAUL, content: 'Amen', created_at: '2026-11-06T10:05:00Z' },
            { id: 'm3', conversation_id: 'c1', sender_id: ME, content: 'Merci', created_at: '2026-11-06T10:04:00Z' },
            { id: 'm2', conversation_id: 'c1', sender_id: PAUL, content: 'Je prie', created_at: '2026-11-06T10:02:00Z' },
            { id: 'm1', conversation_id: 'c1', sender_id: PAUL, content: 'Bonjour', created_at: '2026-11-06T10:00:00Z' },
          ],
        },
      ],
      user_blocks: [{ data: [] }],
    });
    const [summary] = await service.listConversations(ME);
    expect(summary).toMatchObject({ unread: 2, peer: { displayName: 'Pasteur Paul' }, lastMessage: { content: 'Amen', mine: false } });
    expect((await service.unreadTotal(ME)).unread).toBe(2);
  });

  it('shows an empty inbox before the migration', async () => {
    const { service } = build({ conversations: [{ error: { code: '42P01', message: 'missing' } }] });
    await expect(service.listConversations(ME)).resolves.toEqual([]);
  });
});
