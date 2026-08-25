import { PrayerTestimoniesService } from './prayer-testimonies.service';
import { createQueryChain, createSupabaseServiceMock } from '../testing/supabase-query-mock';

const DRAFT_TESTIMONY = {
  id: 'testimony-1',
  author_id: 'user-1',
  related_request_id: null,
  media_type: 'TEXT',
  content: 'Dieu a guéri ma famille',
  file_id: null,
  status: 'DRAFT',
  moderated_by: null,
  moderation_reason: null,
};

function buildDeps(overrides: Partial<Record<string, unknown>> = {}) {
  const notificationsService = { create: vi.fn().mockResolvedValue(undefined) };
  const pushNotificationsService = overrides.pushNotificationsService ?? { send: vi.fn().mockResolvedValue([]) };
  const socialPublicationsService = { create: vi.fn().mockResolvedValue(undefined) };
  const aiModerationService =
    overrides.aiModerationService ?? { moderate: vi.fn().mockResolvedValue({ flagged: false, confidence: 0, reason: null, critical: false }) };
  const aiAgentsService = overrides.aiAgentsService ?? { draftSocialPost: vi.fn().mockRejectedValue(new Error('no key')) };
  const filesService = overrides.filesService ?? { getPublicReadUrl: vi.fn().mockResolvedValue(null) };
  const supabase = overrides.supabase ?? createSupabaseServiceMock({});
  const service = new PrayerTestimoniesService(
    supabase as never,
    notificationsService as never,
    pushNotificationsService as never,
    socialPublicationsService as never,
    aiModerationService as never,
    aiAgentsService as never,
    filesService as never,
  );
  return {
    service,
    notificationsService,
    pushNotificationsService,
    socialPublicationsService,
    aiModerationService,
    aiAgentsService,
    filesService,
    supabase,
  };
}

describe('PrayerTestimoniesService', () => {
  describe('create', () => {
    it('requires content for a TEXT testimony', async () => {
      const { service } = buildDeps();

      await expect(
        service.create({ mediaType: 'TEXT' } as never, 'user-1'),
      ).rejects.toThrow('content is required for a TEXT testimony');
    });

    it('requires a fileId for a non-TEXT testimony', async () => {
      const { service } = buildDeps();

      await expect(
        service.create({ mediaType: 'AUDIO' } as never, 'user-1'),
      ).rejects.toThrow('fileId is required for a non-TEXT testimony');
    });

    it('defaults to DRAFT status on insert', async () => {
      const testimoniesChain = createQueryChain({ data: DRAFT_TESTIMONY, error: null });
      const supabase = createSupabaseServiceMock({ testimonies: testimoniesChain });
      const { service } = buildDeps({ supabase });

      await service.create({ content: 'Dieu a guéri ma famille' } as never, 'user-1');

      expect(testimoniesChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'DRAFT', content: 'Dieu a guéri ma famille' }),
      );
    });
  });

  describe('approve', () => {
    it('rejects approving a testimony that does not exist', async () => {
      const supabase = createSupabaseServiceMock({
        testimonies: createQueryChain({ data: null, error: null }),
      });
      const { service } = buildDeps({ supabase });

      await expect(service.approve('missing', 'moderator-1')).rejects.toThrow('Testimony missing not found');
    });

    it('refuses to re-approve a testimony that is not pending (DRAFT)', async () => {
      const supabase = createSupabaseServiceMock({
        testimonies: createQueryChain({ data: { ...DRAFT_TESTIMONY, status: 'PUBLISHED' }, error: null }),
      });
      const { service } = buildDeps({ supabase });

      await expect(service.approve('testimony-1', 'moderator-1')).rejects.toThrow(
        'Testimony testimony-1 is not pending moderation',
      );
    });

    it('publishes the testimony, notifies the author, and drafts one social publication per channel', async () => {
      const published = { ...DRAFT_TESTIMONY, status: 'PUBLISHED', moderated_by: 'moderator-1' };
      // getModeratable reads once, then approve() reads again via the update+select — two
      // sequential `.from('testimonies')` calls consumed in order.
      const supabase = createSupabaseServiceMock({
        testimonies: [
          createQueryChain({ data: DRAFT_TESTIMONY, error: null }),
          createQueryChain({ data: published, error: null }),
        ],
      });
      const { service, notificationsService, socialPublicationsService } = buildDeps({ supabase });

      const result = await service.approve('testimony-1', 'moderator-1');

      expect(result.status).toBe('PUBLISHED');
      expect(notificationsService.create).toHaveBeenCalledWith(
        'user-1',
        'TESTIMONY_PUBLISHED',
        { testimonyId: 'testimony-1' },
      );
      expect(socialPublicationsService.create).toHaveBeenCalledTimes(7);
      expect(socialPublicationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'Facebook',
          testimonyId: 'testimony-1',
          draftContent: expect.stringContaining('Dieu a guéri ma famille'),
        }),
      );
    });
  });

  describe('reject', () => {
    it('rejects a non-pending testimony', async () => {
      const supabase = createSupabaseServiceMock({
        testimonies: createQueryChain({ data: { ...DRAFT_TESTIMONY, status: 'REJECTED' }, error: null }),
      });
      const { service } = buildDeps({ supabase });

      await expect(service.reject('testimony-1', 'moderator-1', 'Contenu inapproprié')).rejects.toThrow(
        'is not pending moderation',
      );
    });

    it('records the moderation reason, notifies the author, and does not draft social publications', async () => {
      const rejected = { ...DRAFT_TESTIMONY, moderation_reason: 'Contenu inapproprié' };
      const supabase = createSupabaseServiceMock({
        testimonies: [
          createQueryChain({ data: DRAFT_TESTIMONY, error: null }),
          createQueryChain({ data: rejected, error: null }),
        ],
      });
      const { service, notificationsService, socialPublicationsService } = buildDeps({ supabase });

      const result = await service.reject('testimony-1', 'moderator-1', 'Contenu inapproprié');

      expect(result.moderation_reason).toBe('Contenu inapproprié');
      expect(notificationsService.create).toHaveBeenCalledWith(
        'user-1',
        'TESTIMONY_REJECTED',
        { testimonyId: 'testimony-1', reason: 'Contenu inapproprié' },
      );
      expect(socialPublicationsService.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('rejects an edit from anyone other than the author', async () => {
      const supabase = createSupabaseServiceMock({
        testimonies: createQueryChain({ data: DRAFT_TESTIMONY, error: null }),
      });
      const { service } = buildDeps({ supabase });

      await expect(
        service.update('testimony-1', { content: 'x' } as never, 'someone-else'),
      ).rejects.toThrow('Permission denied');
    });

    it('rejects editing a testimony that is no longer DRAFT', async () => {
      const supabase = createSupabaseServiceMock({
        testimonies: createQueryChain({ data: { ...DRAFT_TESTIMONY, status: 'PUBLISHED' }, error: null }),
      });
      const { service } = buildDeps({ supabase });

      await expect(
        service.update('testimony-1', { content: 'x' } as never, 'user-1'),
      ).rejects.toThrow('can no longer be edited');
    });

    it('clears a prior rejection and re-runs moderation when the author revises the content', async () => {
      const rejected = { ...DRAFT_TESTIMONY, moderation_reason: 'Contenu inapproprié', moderated_by: 'moderator-1' };
      const revised = { ...DRAFT_TESTIMONY, content: 'Version corrigée', moderation_reason: null, moderated_by: null };
      const supabase = createSupabaseServiceMock({
        testimonies: [
          createQueryChain({ data: rejected, error: null }), // findById
          createQueryChain({ data: revised, error: null }), // update
        ],
      });
      const aiModerationService = { moderate: vi.fn().mockResolvedValue({ flagged: false, confidence: 0, reason: null, critical: false }) };
      const { service } = buildDeps({ supabase, aiModerationService });

      const result = await service.update('testimony-1', { content: 'Version corrigée' } as never, 'user-1');

      expect(aiModerationService.moderate).toHaveBeenCalledWith('Version corrigée', 'user-1');
      expect(result.moderation_reason).toBeNull();
      expect(result.content).toBe('Version corrigée');
    });

    it('does not re-run moderation when only the media, not the content, changes', async () => {
      const supabase = createSupabaseServiceMock({
        testimonies: [
          createQueryChain({ data: DRAFT_TESTIMONY, error: null }),
          createQueryChain({ data: { ...DRAFT_TESTIMONY, file_id: 'file-2' }, error: null }),
        ],
      });
      const aiModerationService = { moderate: vi.fn() };
      const { service } = buildDeps({ supabase, aiModerationService });

      await service.update('testimony-1', { fileId: 'file-2' } as never, 'user-1');

      expect(aiModerationService.moderate).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('a non-moderator only ever sees PUBLISHED testimonies, regardless of the requested status', async () => {
      const chain = createQueryChain({ data: [], error: null, count: 0 });
      const supabase = createSupabaseServiceMock({ testimonies: chain });
      const { service } = buildDeps({ supabase });

      await service.list({ status: 'DRAFT' } as never, false);

      expect(chain.eq).toHaveBeenCalledWith('status', 'PUBLISHED');
    });

    it('a moderator can filter by an explicit status', async () => {
      const chain = createQueryChain({ data: [], error: null, count: 0 });
      const supabase = createSupabaseServiceMock({ testimonies: chain });
      const { service } = buildDeps({ supabase });

      await service.list({ status: 'DRAFT' } as never, true);

      expect(chain.eq).toHaveBeenCalledWith('status', 'DRAFT');
    });

    it('mine: shows the caller their own testimony of any status, not just PUBLISHED', async () => {
      const chain = createQueryChain({ data: [DRAFT_TESTIMONY], error: null, count: 1 });
      const supabase = createSupabaseServiceMock({ testimonies: chain });
      const { service } = buildDeps({ supabase });

      await service.list({ mine: true } as never, false, 'user-1');

      expect(chain.eq).toHaveBeenCalledWith('author_id', 'user-1');
      expect(chain.eq).not.toHaveBeenCalledWith('status', 'PUBLISHED');
    });

    it('mine: still honors an explicit status filter for the caller\'s own testimonies', async () => {
      const chain = createQueryChain({ data: [DRAFT_TESTIMONY], error: null, count: 1 });
      const supabase = createSupabaseServiceMock({ testimonies: chain });
      const { service } = buildDeps({ supabase });

      await service.list({ mine: true, status: 'ARCHIVED' } as never, false, 'user-1');

      expect(chain.eq).toHaveBeenCalledWith('author_id', 'user-1');
      expect(chain.eq).toHaveBeenCalledWith('status', 'ARCHIVED');
    });
  });
});
