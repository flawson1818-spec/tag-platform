import { BadRequestException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { SocialService } from './social.service';

type Result = { data?: unknown; error?: { code?: string; message: string } | null; count?: number };

/** A chainable stand-in for the Supabase query builder: every call is recorded, and the query
 *  resolves to whatever the test queued for that table. */
function fakeDb(responses: Record<string, Result[]>) {
  const calls: { table: string; ops: [string, unknown[]][] }[] = [];
  const from = (table: string) => {
    const entry = { table, ops: [] as [string, unknown[]][] };
    calls.push(entry);
    const next = () => {
      const queue = responses[table] ?? [];
      const r = queue.length > 1 ? queue.shift() : queue[0];
      return Promise.resolve({ data: null, error: null, count: 0, ...(r ?? {}) });
    };
    const builder: Record<string, unknown> = {};
    for (const op of ['select', 'insert', 'upsert', 'delete', 'eq', 'is', 'or', 'in', 'order', 'range', 'limit', 'ilike']) {
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

const POST = {
  id: 'p1',
  community_id: null,
  author_id: 'u1',
  content: 'Gloire à Dieu',
  status: 'PUBLISHED',
  created_at: '2026-11-06T10:00:00Z',
  author: { id: 'u1', display_name: 'Marie', avatar_file_id: null },
  community: null,
};

function build(responses: Record<string, Result[]>, file: unknown = null) {
  const db = fakeDb(responses);
  const files = {
    findById: vi.fn().mockImplementation(async () => {
      if (!file) throw new Error('not found');
      return file;
    }),
    getPublicReadUrls: vi.fn().mockResolvedValue(new Map([['f1', 'https://signed/f1']])),
  };
  const service = new SocialService(db as never, files as never);
  return { service, db, files };
}

describe('SocialService', () => {
  describe('createPost', () => {
    it('refuses an empty post', async () => {
      const { service } = build({});
      await expect(service.createPost('u1', { content: '   ' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses to post in a community the author is not a member of', async () => {
      const { service } = build({ community_members: [{ data: null }] });
      await expect(
        service.createPost('u1', { content: 'Bonjour', communityId: '00000000-0000-0000-0000-000000000001' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("refuses a photo that isn't an available image of the author", async () => {
      const { service } = build({}, { status: 'AVAILABLE', mime_type: 'application/pdf' });
      await expect(service.createPost('u1', { photoFileIds: ['f1'] })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('publishes a personal post with its photo, in order', async () => {
      const { service, db } = build(
        { posts: [{ data: { id: 'p1' } }, { data: POST }], post_photos: [{ data: [{ post_id: 'p1', file_id: 'f1', position: 0 }] }] },
        { status: 'AVAILABLE', mime_type: 'image/jpeg' },
      );
      const post = await service.createPost('u1', { content: 'Gloire à Dieu', photoFileIds: ['f1'] });

      const insert = db.calls.find((c) => c.table === 'posts')?.ops.find(([op]) => op === 'insert');
      expect(insert?.[1][0]).toMatchObject({ community_id: null, author_id: 'u1', status: 'PUBLISHED' });
      expect(post.photos).toEqual(['https://signed/f1']);
      expect(post.mine).toBe(true);
    });

    it('answers 503 before the migration that allows personal posts', async () => {
      const { service } = build({ posts: [{ error: { code: '23502', message: 'not null' } }] });
      await expect(service.createPost('u1', { content: 'Bonjour' })).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });

  describe('feed', () => {
    it('shows personal posts and the posts of my communities only', async () => {
      const { service, db } = build({
        community_members: [{ data: [{ community_id: 'c1' }, { community_id: 'c2' }] }],
        posts: [{ data: [POST], count: 1 }],
        post_amens: [{ data: [{ post_id: 'p1', user_id: 'u2' }, { post_id: 'p1', user_id: 'u3' }] }],
        comments: [{ data: [{ post_id: 'p1' }] }],
      });
      const page = await service.feed('u2');

      const scope = db.calls.find((c) => c.table === 'posts')?.ops.find(([op]) => op === 'or');
      expect(scope?.[1][0]).toBe('community_id.is.null,community_id.in.(c1,c2)');
      expect(page.data[0]).toMatchObject({ amenCount: 2, amenedByMe: true, commentCount: 1, mine: false });
      expect(page.meta.total).toBe(1);
    });

    it('still works before the migration: no photos, no Amen yet', async () => {
      const missing = { error: { code: '42P01', message: 'missing' } };
      const { service } = build({
        community_members: [{ data: [] }],
        posts: [{ data: [POST], count: 1 }],
        post_photos: [missing],
        post_amens: [missing],
      });
      const page = await service.feed('u1');
      expect(page.data[0]).toMatchObject({ photos: [], amenCount: 0 });
    });
  });

  describe('profiles', () => {
    it('never reads e-mail or phone, and falls back to an empty bio before the migration', async () => {
      const { service, db } = build({
        users: [{ data: { id: 'u1', display_name: 'Marie', avatar_file_id: null, created_at: '2026-01-01' } }],
        user_profiles: [{ error: { code: '42P01', message: 'missing' } }],
        community_members: [{ data: [{ community: { id: 'c1', name: 'Église de Lomé', type: 'CHURCH', deleted_at: null } }] }],
        posts: [{ count: 3 }],
      });
      const profile = await service.profile('u1', 'u2');

      const select = db.calls.find((c) => c.table === 'users')?.ops.find(([op]) => op === 'select');
      expect(String(select?.[1][0])).not.toMatch(/email|phone/);
      expect(profile).toMatchObject({ displayName: 'Marie', bio: null, postCount: 3, isMe: false });
      expect(profile.communities).toEqual([{ id: 'c1', name: 'Église de Lomé', type: 'CHURCH' }]);
      expect(profile).not.toHaveProperty('email');
    });

    it('editing my profile before the migration answers 503', async () => {
      const { service } = build({ user_profiles: [{ error: { code: 'PGRST205', message: 'missing' } }] });
      await expect(service.updateMyProfile('u1', { bio: 'Servante' })).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });

  describe('members directory', () => {
    it('finds members by name only, with church and city, never e-mail or phone', async () => {
      const { service, db } = build({
        users: [{ data: [{ id: 'u2', display_name: 'Paul', avatar_file_id: null }] }],
        user_profiles: [{ data: [{ user_id: 'u2', church_name: 'Église de la Grâce', city: 'Lomé' }] }],
      });
      const found = await service.searchMembers('Pa,ul');
      const select = db.calls.find((c) => c.table === 'users')?.ops.find(([op]) => op === 'select');
      expect(String(select?.[1][0])).not.toMatch(/email|phone/);
      expect(found).toEqual([{ id: 'u2', displayName: 'Paul', avatarUrl: null, churchName: 'Église de la Grâce', city: 'Lomé' }]);
    });
  });

  describe('feed filters', () => {
    it("shows a group's wall to its members only", async () => {
      const { service, db } = build({ community_members: [{ data: [{ community_id: 'c1' }] }], posts: [{ data: [], count: 0 }] });
      await service.feed('u1', 1, 20, { communityId: 'c1' });
      const posts = db.calls.find((c) => c.table === 'posts');
      expect(posts?.ops).toContainEqual(['eq', ['community_id', 'c1']]);

      const outsider = build({ community_members: [{ data: [] }] });
      const res = await outsider.service.feed('u2', 1, 20, { communityId: 'c1' });
      expect(res.data).toEqual([]);
      expect(outsider.db.calls.some((c) => c.table === 'posts')).toBe(false);
    });

    it('filters by kind, and finds nothing (no error) before the migration', async () => {
      const { service, db } = build({ community_members: [{ data: [] }], posts: [{ data: [], count: 0 }] });
      await service.feed('u1', 1, 20, { view: 'EXPERIENCE' });
      expect(db.calls.find((c) => c.table === 'posts')?.ops).toContainEqual(['eq', ['kind', 'EXPERIENCE']]);

      const before = build({ community_members: [{ data: [] }], posts: [{ error: { code: '42703', message: 'no kind' } }] });
      await expect(before.service.feed('u1', 1, 20, { view: 'WRITING' })).resolves.toMatchObject({ data: [] });
    });
  });
});
