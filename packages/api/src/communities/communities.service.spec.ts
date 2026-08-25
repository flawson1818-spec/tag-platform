import { CommunitiesService } from './communities.service';
import { createQueryChain, createSupabaseServiceMock } from '../testing/supabase-query-mock';

const COMMUNITY = {
  id: 'community-1',
  type: 'CELLULE',
  name: 'Cellule Soviépé',
  parent_id: null,
  language: 'fr',
  timezone: 'Africa/Abidjan',
  join_policy: 'OPEN',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  deleted_at: null,
};

const APPROVAL_COMMUNITY = { ...COMMUNITY, join_policy: 'APPROVAL' };

describe('CommunitiesService', () => {
  describe('findById', () => {
    it('returns the community when found', async () => {
      const supabase = createSupabaseServiceMock({
        communities: createQueryChain({ data: COMMUNITY, error: null }),
      });
      const service = new CommunitiesService(supabase as never);

      const result = await service.findById('community-1');

      expect(result).toEqual(COMMUNITY);
    });

    it('throws NotFoundException when no row matches', async () => {
      const supabase = createSupabaseServiceMock({
        communities: createQueryChain({ data: null, error: null }),
      });
      const service = new CommunitiesService(supabase as never);

      await expect(service.findById('missing')).rejects.toThrow('Community missing not found');
    });

    it('excludes soft-deleted rows via the deleted_at filter', async () => {
      const chain = createQueryChain({ data: COMMUNITY, error: null });
      const supabase = createSupabaseServiceMock({ communities: chain });
      const service = new CommunitiesService(supabase as never);

      await service.findById('community-1');

      expect(chain.is).toHaveBeenCalledWith('deleted_at', null);
    });
  });

  describe('create', () => {
    it('inserts the community and auto-joins the creator as a member', async () => {
      const communitiesChain = createQueryChain({ data: COMMUNITY, error: null });
      const membersChain = createQueryChain({ data: null, error: null });
      const supabase = createSupabaseServiceMock({
        communities: communitiesChain,
        community_members: membersChain,
      });
      const service = new CommunitiesService(supabase as never);

      const result = await service.create(
        { type: 'CELLULE', name: 'Cellule Soviépé', language: 'fr', timezone: 'Africa/Abidjan' } as never,
        'actor-1',
      );

      expect(communitiesChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Cellule Soviépé', created_by: 'actor-1' }),
      );
      expect(membersChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ community_id: 'community-1', user_id: 'actor-1' }),
      );
      expect(result).toEqual(COMMUNITY);
    });
  });

  describe('join', () => {
    it('checks the community exists, then adds the caller as an ACTIVE member for an OPEN policy', async () => {
      const communitiesChain = createQueryChain({ data: COMMUNITY, error: null });
      const membersChain = createQueryChain({ data: null, error: null });
      const supabase = createSupabaseServiceMock({
        communities: communitiesChain,
        community_members: membersChain,
      });
      const service = new CommunitiesService(supabase as never);

      const result = await service.join('community-1', 'user-1');

      expect(membersChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ community_id: 'community-1', user_id: 'user-1', status: 'ACTIVE' }),
      );
      expect(result).toEqual({ status: 'ACTIVE' });
    });

    it('adds the caller as PENDING for an APPROVAL policy, and reports that back', async () => {
      const communitiesChain = createQueryChain({ data: APPROVAL_COMMUNITY, error: null });
      const membersChain = createQueryChain({ data: null, error: null });
      const supabase = createSupabaseServiceMock({
        communities: communitiesChain,
        community_members: membersChain,
      });
      const service = new CommunitiesService(supabase as never);

      const result = await service.join('community-1', 'user-1');

      expect(membersChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ community_id: 'community-1', user_id: 'user-1', status: 'PENDING' }),
      );
      expect(result).toEqual({ status: 'PENDING' });
    });

    it('propagates NotFoundException for an unknown community without touching community_members', async () => {
      const communitiesChain = createQueryChain({ data: null, error: null });
      const membersChain = createQueryChain({ data: null, error: null });
      const supabase = createSupabaseServiceMock({
        communities: communitiesChain,
        community_members: membersChain,
      });
      const service = new CommunitiesService(supabase as never);

      await expect(service.join('missing', 'user-1')).rejects.toThrow('Community missing not found');
      expect(membersChain.insert).not.toHaveBeenCalled();
    });

    it('tolerates joining a community the caller already belongs to', async () => {
      const communitiesChain = createQueryChain({ data: COMMUNITY, error: null });
      const membersChain = createQueryChain({ data: null, error: { message: 'duplicate key', code: '23505' } });
      const supabase = createSupabaseServiceMock({
        communities: communitiesChain,
        community_members: membersChain,
      });
      const service = new CommunitiesService(supabase as never);

      await expect(service.join('community-1', 'user-1')).resolves.toEqual({ status: 'ACTIVE' });
    });
  });

  describe('getMembershipStatus', () => {
    it('returns NONE when there is no membership row at all', async () => {
      const supabase = createSupabaseServiceMock({
        community_members: createQueryChain({ data: null, error: null }),
      });
      const service = new CommunitiesService(supabase as never);

      await expect(service.getMembershipStatus('community-1', 'user-1')).resolves.toBe('NONE');
    });

    it('returns the row status when a membership exists', async () => {
      const supabase = createSupabaseServiceMock({
        community_members: createQueryChain({ data: { status: 'PENDING' }, error: null }),
      });
      const service = new CommunitiesService(supabase as never);

      await expect(service.getMembershipStatus('community-1', 'user-1')).resolves.toBe('PENDING');
    });
  });

  describe('approveMembership', () => {
    it('moves a PENDING request to ACTIVE', async () => {
      const chain = createQueryChain({ data: { id: 'member-1' }, error: null });
      const supabase = createSupabaseServiceMock({ community_members: chain });
      const service = new CommunitiesService(supabase as never);

      await service.approveMembership('community-1', 'user-1');

      expect(chain.update).toHaveBeenCalledWith({ status: 'ACTIVE' });
      expect(chain.eq).toHaveBeenCalledWith('status', 'PENDING');
    });

    it('throws NotFoundException when there is no matching pending request', async () => {
      const chain = createQueryChain({ data: null, error: null });
      const supabase = createSupabaseServiceMock({ community_members: chain });
      const service = new CommunitiesService(supabase as never);

      await expect(service.approveMembership('community-1', 'user-1')).rejects.toThrow(
        'No pending membership request found for this user',
      );
    });
  });

  describe('addMember', () => {
    it('tolerates a duplicate-membership conflict (23505) instead of throwing', async () => {
      const supabase = createSupabaseServiceMock({
        community_members: createQueryChain({ data: null, error: { message: 'duplicate key', code: '23505' } }),
      });
      const service = new CommunitiesService(supabase as never);

      await expect(service.addMember('community-1', { userId: 'user-1' })).resolves.toBeUndefined();
    });

    it('throws on any other database error', async () => {
      const supabase = createSupabaseServiceMock({
        community_members: createQueryChain({ data: null, error: { message: 'db down', code: '500' } }),
      });
      const service = new CommunitiesService(supabase as never);

      await expect(service.addMember('community-1', { userId: 'user-1' })).rejects.toThrow('db down');
    });
  });

  describe('update', () => {
    it('checks existence before updating, then persists the new fields', async () => {
      const findChain = createQueryChain({ data: COMMUNITY, error: null });
      const updateChain = createQueryChain({ data: { ...COMMUNITY, name: 'Renamed' }, error: null });
      const supabase = createSupabaseServiceMock({ communities: [findChain, updateChain] });
      const service = new CommunitiesService(supabase as never);

      const result = await service.update(
        'community-1',
        { name: 'Renamed', language: 'fr', timezone: 'Africa/Abidjan' } as never,
        'actor-1',
      );

      expect(result.name).toBe('Renamed');
    });

    it('propagates NotFoundException from the existence check without updating', async () => {
      const findChain = createQueryChain({ data: null, error: null });
      const updateChain = createQueryChain({ data: null, error: null });
      const supabase = createSupabaseServiceMock({ communities: [findChain, updateChain] });
      const service = new CommunitiesService(supabase as never);

      await expect(
        service.update('missing', { name: 'x', language: 'fr', timezone: 'UTC' } as never, 'actor-1'),
      ).rejects.toThrow('Community missing not found');
      expect(updateChain.update).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('applies optional type and parentId filters', async () => {
      const chain = createQueryChain({ data: [COMMUNITY], error: null, count: 1 });
      const supabase = createSupabaseServiceMock({ communities: chain });
      const service = new CommunitiesService(supabase as never);

      const result = await service.list({ type: 'CELLULE', parentId: 'parent-1' } as never);

      expect(chain.eq).toHaveBeenCalledWith('type', 'CELLULE');
      expect(chain.eq).toHaveBeenCalledWith('parent_id', 'parent-1');
      expect(result.meta.total).toBe(1);
    });

    it('applies a case-insensitive name search when provided', async () => {
      const chain = createQueryChain({ data: [COMMUNITY], error: null, count: 1 });
      const supabase = createSupabaseServiceMock({ communities: chain });
      const service = new CommunitiesService(supabase as never);

      await service.list({ search: 'Soviépé' } as never);

      expect(chain.ilike).toHaveBeenCalledWith('name', '%Soviépé%');
    });

    it('skips filters that were not provided', async () => {
      const chain = createQueryChain({ data: [], error: null, count: 0 });
      const supabase = createSupabaseServiceMock({ communities: chain });
      const service = new CommunitiesService(supabase as never);

      await service.list({} as never);

      expect(chain.eq).not.toHaveBeenCalled();
    });
  });
});
