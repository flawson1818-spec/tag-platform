import { SocialPublicationsService } from './social-publications.service';
import { createQueryChain, createSupabaseServiceMock } from '../testing/supabase-query-mock';

const DRAFT_PUBLICATION = {
  id: 'pub-1',
  testimony_id: 'testimony-1',
  channel: 'Facebook',
  draft_content: 'Un témoignage a été partagé.',
  status: 'DRAFT',
  approved_by: null,
  published_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

function buildService(supabase: ReturnType<typeof createSupabaseServiceMock>) {
  return new SocialPublicationsService(supabase as never);
}

describe('SocialPublicationsService', () => {
  describe('create', () => {
    it('always starts a new draft at status DRAFT', async () => {
      const chain = createQueryChain({ data: DRAFT_PUBLICATION, error: null });
      const supabase = createSupabaseServiceMock({ social_publications: chain });
      const service = buildService(supabase);

      await service.create({ channel: 'Facebook', draftContent: 'x', testimonyId: 'testimony-1' } as never);

      expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({ status: 'DRAFT' }));
    });
  });

  describe('approve', () => {
    it('marks a DRAFT publication APPROVED with the acting moderator', async () => {
      const supabase = createSupabaseServiceMock({
        social_publications: [
          createQueryChain({ data: DRAFT_PUBLICATION, error: null }),
          createQueryChain({ data: { ...DRAFT_PUBLICATION, status: 'APPROVED', approved_by: 'moderator-1' }, error: null }),
        ],
      });
      const service = buildService(supabase);

      const result = await service.approve('pub-1', 'moderator-1');

      expect(result.status).toBe('APPROVED');
      expect(result.approved_by).toBe('moderator-1');
    });

    it('also allows approving a PENDING_APPROVAL publication', async () => {
      const supabase = createSupabaseServiceMock({
        social_publications: [
          createQueryChain({ data: { ...DRAFT_PUBLICATION, status: 'PENDING_APPROVAL' }, error: null }),
          createQueryChain({ data: { ...DRAFT_PUBLICATION, status: 'APPROVED' }, error: null }),
        ],
      });
      const service = buildService(supabase);

      await expect(service.approve('pub-1', 'moderator-1')).resolves.toMatchObject({ status: 'APPROVED' });
    });

    it('refuses to re-approve a publication that is already APPROVED', async () => {
      const supabase = createSupabaseServiceMock({
        social_publications: createQueryChain({ data: { ...DRAFT_PUBLICATION, status: 'APPROVED' }, error: null }),
      });
      const service = buildService(supabase);

      await expect(service.approve('pub-1', 'moderator-1')).rejects.toThrow(
        'Social publication pub-1 is not pending approval',
      );
    });

    it('refuses to approve an already-PUBLISHED publication', async () => {
      const supabase = createSupabaseServiceMock({
        social_publications: createQueryChain({ data: { ...DRAFT_PUBLICATION, status: 'PUBLISHED' }, error: null }),
      });
      const service = buildService(supabase);

      await expect(service.approve('pub-1', 'moderator-1')).rejects.toThrow(
        'Social publication pub-1 is not pending approval',
      );
    });

    it('throws NotFoundException for an unknown publication', async () => {
      const supabase = createSupabaseServiceMock({
        social_publications: createQueryChain({ data: null, error: null }),
      });
      const service = buildService(supabase);

      await expect(service.approve('missing', 'moderator-1')).rejects.toThrow('Social publication missing not found');
    });
  });

  describe('reject', () => {
    it('marks a DRAFT publication REJECTED with the acting moderator', async () => {
      const supabase = createSupabaseServiceMock({
        social_publications: [
          createQueryChain({ data: DRAFT_PUBLICATION, error: null }),
          createQueryChain({ data: { ...DRAFT_PUBLICATION, status: 'REJECTED', approved_by: 'moderator-1' }, error: null }),
        ],
      });
      const service = buildService(supabase);

      const result = await service.reject('pub-1', 'moderator-1');

      expect(result.status).toBe('REJECTED');
    });
  });
});
