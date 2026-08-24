import { PrayerRequestsService } from './prayer-requests.service';
import { createQueryChain, createSupabaseServiceMock } from '../testing/supabase-query-mock';

const NEW_REQUEST = {
  id: 'request-1',
  author_id: 'user-1',
  category: 'Famille',
  description: 'Prie pour ma famille',
  photo_file_id: null,
  attachment_file_id: null,
  confidentiality: 'PUBLIC',
  status: 'NEW',
  promoted_slot_id: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  deleted_at: null,
};

function buildDeps(overrides: Partial<Record<string, unknown>> = {}) {
  const slotsService = overrides.slotsService ?? { create: vi.fn() };
  const notificationsService = overrides.notificationsService ?? { create: vi.fn().mockResolvedValue(undefined) };
  const pushNotificationsService = overrides.pushNotificationsService ?? { send: vi.fn().mockResolvedValue([]) };
  const aiModerationService =
    overrides.aiModerationService ?? { moderate: vi.fn().mockResolvedValue({ flagged: false, confidence: 0, reason: null, critical: false }) };
  const aiAgentsService = overrides.aiAgentsService ?? { draftGuidedPrayer: vi.fn().mockRejectedValue(new Error('no key')) };
  const filesService = overrides.filesService ?? { getPublicReadUrl: vi.fn().mockResolvedValue(null) };
  const supabase = overrides.supabase ?? createSupabaseServiceMock({});
  const service = new PrayerRequestsService(
    supabase as never,
    slotsService as never,
    notificationsService as never,
    pushNotificationsService as never,
    aiModerationService as never,
    aiAgentsService as never,
    filesService as never,
  );
  return { service, slotsService, notificationsService, pushNotificationsService, aiModerationService, aiAgentsService, filesService, supabase };
}

describe('PrayerRequestsService', () => {
  describe('create — confidentiality downgrade', () => {
    it('keeps PUBLIC when the author is known and allowed to post public requests', async () => {
      const chain = createQueryChain({ data: NEW_REQUEST, error: null });
      const supabase = createSupabaseServiceMock({ prayer_requests: chain });
      const { service } = buildDeps({ supabase });

      await service.create({ category: 'Famille', description: 'x', confidentiality: 'PUBLIC' } as never, 'user-1', true);

      expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({ confidentiality: 'PUBLIC', author_id: 'user-1' }));
    });

    it('downgrades PUBLIC to ANONYMOUS when there is no authenticated author', async () => {
      const chain = createQueryChain({ data: NEW_REQUEST, error: null });
      const supabase = createSupabaseServiceMock({ prayer_requests: chain });
      const { service } = buildDeps({ supabase });

      await service.create({ category: 'Famille', description: 'x', confidentiality: 'PUBLIC' } as never, null, true);

      expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({ confidentiality: 'ANONYMOUS', author_id: null }));
    });

    it('downgrades PUBLIC to ANONYMOUS when the author lacks the create_public permission', async () => {
      const chain = createQueryChain({ data: NEW_REQUEST, error: null });
      const supabase = createSupabaseServiceMock({ prayer_requests: chain });
      const { service } = buildDeps({ supabase });

      await service.create({ category: 'Famille', description: 'x', confidentiality: 'PUBLIC' } as never, 'user-1', false);

      expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({ confidentiality: 'ANONYMOUS', author_id: null }));
    });

    it('defaults to ANONYMOUS when no confidentiality is specified', async () => {
      const chain = createQueryChain({ data: NEW_REQUEST, error: null });
      const supabase = createSupabaseServiceMock({ prayer_requests: chain });
      const { service } = buildDeps({ supabase });

      await service.create({ category: 'Famille', description: 'x' } as never, 'user-1', true);

      expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({ confidentiality: 'ANONYMOUS' }));
    });

    it('persists the IA Modératrice classification on the row', async () => {
      const chain = createQueryChain({ data: NEW_REQUEST, error: null });
      const supabase = createSupabaseServiceMock({ prayer_requests: chain });
      const aiModerationService = { moderate: vi.fn().mockResolvedValue({ flagged: true, confidence: 0.8, reason: 'suspect', critical: false }) };
      const { service } = buildDeps({ supabase, aiModerationService });

      await service.create({ category: 'Famille', description: 'x' } as never, 'user-1', true);

      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ ai_flagged: true, ai_flag_reason: 'suspect', ai_flag_confidence: 0.8 }),
      );
    });
  });

  describe('findById — visibility', () => {
    it('hides a PRIVATE request from a caller without canSeePrivate (404, not 403 — no existence leak)', async () => {
      const supabase = createSupabaseServiceMock({
        prayer_requests: createQueryChain({ data: { ...NEW_REQUEST, confidentiality: 'PRIVATE' }, error: null }),
      });
      const { service } = buildDeps({ supabase });

      await expect(service.findById('request-1', false)).rejects.toThrow('Prayer request request-1 not found');
    });

    it('shows a PRIVATE request to a moderator', async () => {
      const supabase = createSupabaseServiceMock({
        prayer_requests: createQueryChain({ data: { ...NEW_REQUEST, confidentiality: 'PRIVATE' }, error: null }),
      });
      const { service } = buildDeps({ supabase });

      await expect(service.findById('request-1', true)).resolves.toMatchObject({ confidentiality: 'PRIVATE' });
    });
  });

  describe('updateStatus — permission gate', () => {
    it('lets the owner move their own NEW request', async () => {
      const supabase = createSupabaseServiceMock({
        prayer_requests: [
          createQueryChain({ data: NEW_REQUEST, error: null }),
          createQueryChain({ data: { ...NEW_REQUEST, status: 'ARCHIVED' }, error: null }),
        ],
      });
      const { service } = buildDeps({ supabase });

      const result = await service.updateStatus('request-1', 'ARCHIVED' as never, 'user-1', false);

      expect(result.status).toBe('ARCHIVED');
    });

    it('refuses a non-owner without canManageStatus', async () => {
      const supabase = createSupabaseServiceMock({
        prayer_requests: createQueryChain({ data: NEW_REQUEST, error: null }),
      });
      const { service } = buildDeps({ supabase });

      await expect(service.updateStatus('request-1', 'ARCHIVED' as never, 'someone-else', false)).rejects.toThrow(
        'Permission denied',
      );
    });

    it('refuses the owner once the request is no longer NEW, without canManageStatus', async () => {
      const supabase = createSupabaseServiceMock({
        prayer_requests: createQueryChain({ data: { ...NEW_REQUEST, status: 'ASSIGNED' }, error: null }),
      });
      const { service } = buildDeps({ supabase });

      await expect(service.updateStatus('request-1', 'IN_PROGRESS' as never, 'user-1', false)).rejects.toThrow(
        'Permission denied',
      );
    });

    it('lets a moderator manage status regardless of ownership', async () => {
      const supabase = createSupabaseServiceMock({
        prayer_requests: [
          createQueryChain({ data: { ...NEW_REQUEST, status: 'ASSIGNED' }, error: null }),
          createQueryChain({ data: { ...NEW_REQUEST, status: 'IN_PROGRESS' }, error: null }),
        ],
      });
      const { service } = buildDeps({ supabase });

      const result = await service.updateStatus('request-1', 'IN_PROGRESS' as never, 'moderator-1', true);

      expect(result.status).toBe('IN_PROGRESS');
    });

    it('notifies and pushes the author when a request becomes ANSWERED', async () => {
      const supabase = createSupabaseServiceMock({
        prayer_requests: [
          createQueryChain({ data: { ...NEW_REQUEST, status: 'IN_PROGRESS' }, error: null }),
          createQueryChain({ data: { ...NEW_REQUEST, status: 'ANSWERED' }, error: null }),
        ],
      });
      const { service, notificationsService, pushNotificationsService } = buildDeps({ supabase });

      await service.updateStatus('request-1', 'ANSWERED' as never, 'moderator-1', true);

      expect(notificationsService.create).toHaveBeenCalledWith('user-1', 'PRAYER_REQUEST_ANSWERED', {
        prayerRequestId: 'request-1',
      });
      expect(pushNotificationsService.send).toHaveBeenCalledWith('user-1', expect.any(String), expect.any(String));
    });

    it('does not notify when an anonymous (author-less) request becomes ANSWERED', async () => {
      const supabase = createSupabaseServiceMock({
        prayer_requests: [
          createQueryChain({ data: { ...NEW_REQUEST, status: 'IN_PROGRESS', author_id: null }, error: null }),
          createQueryChain({ data: { ...NEW_REQUEST, status: 'ANSWERED', author_id: null }, error: null }),
        ],
      });
      const { service, notificationsService, pushNotificationsService } = buildDeps({ supabase });

      await service.updateStatus('request-1', 'ANSWERED' as never, 'moderator-1', true);

      expect(notificationsService.create).not.toHaveBeenCalled();
      expect(pushNotificationsService.send).not.toHaveBeenCalled();
    });

    it('rejects an illegal state transition even for a moderator', async () => {
      const supabase = createSupabaseServiceMock({
        prayer_requests: createQueryChain({ data: NEW_REQUEST, error: null }),
      });
      const { service } = buildDeps({ supabase });

      await expect(service.updateStatus('request-1', 'ANSWERED' as never, 'moderator-1', true)).rejects.toThrow(
        'Cannot transition prayer request from NEW to ANSWERED',
      );
    });
  });

  describe('promote', () => {
    it('maps the request category to the mapped slot category and falls back to a placeholder guided text', async () => {
      const supabase = createSupabaseServiceMock({
        prayer_requests: [
          createQueryChain({ data: NEW_REQUEST, error: null }),
          createQueryChain({ data: { ...NEW_REQUEST, status: 'ASSIGNED', promoted_slot_id: 'slot-1' }, error: null }),
        ],
      });
      const slotsService = { create: vi.fn().mockResolvedValue({ id: 'slot-1' }) };
      const { service } = buildDeps({ supabase, slotsService });

      await service.promote('request-1', { programId: 'program-1' } as never, 'moderator-1');

      expect(slotsService.create).toHaveBeenCalledWith(
        'program-1',
        expect.objectContaining({ category: 'Famille', guidedText: expect.stringContaining('à valider') }),
      );
    });

    it('uses the AI-generated guided text when available instead of the placeholder', async () => {
      const supabase = createSupabaseServiceMock({
        prayer_requests: [
          createQueryChain({ data: NEW_REQUEST, error: null }),
          createQueryChain({ data: { ...NEW_REQUEST, status: 'ASSIGNED' }, error: null }),
        ],
      });
      const slotsService = { create: vi.fn().mockResolvedValue({ id: 'slot-1' }) };
      const aiAgentsService = { draftGuidedPrayer: vi.fn().mockResolvedValue('Prions avec confiance pour cette famille.') };
      const { service } = buildDeps({ supabase, slotsService, aiAgentsService });

      await service.promote('request-1', { programId: 'program-1' } as never, 'moderator-1');

      expect(slotsService.create).toHaveBeenCalledWith(
        'program-1',
        expect.objectContaining({ guidedText: 'Prions avec confiance pour cette famille.' }),
      );
    });

    it('maps an unlisted category to Autre', async () => {
      const supabase = createSupabaseServiceMock({
        prayer_requests: [
          createQueryChain({ data: { ...NEW_REQUEST, category: 'Visa' }, error: null }),
          createQueryChain({ data: { ...NEW_REQUEST, status: 'ASSIGNED' }, error: null }),
        ],
      });
      const slotsService = { create: vi.fn().mockResolvedValue({ id: 'slot-1' }) };
      const { service } = buildDeps({ supabase, slotsService });

      await service.promote('request-1', { programId: 'program-1' } as never, 'moderator-1');

      expect(slotsService.create).toHaveBeenCalledWith('program-1', expect.objectContaining({ category: 'Autre' }));
    });

    it('rejects promoting a request that is not NEW', async () => {
      const supabase = createSupabaseServiceMock({
        prayer_requests: createQueryChain({ data: { ...NEW_REQUEST, status: 'ANSWERED' }, error: null }),
      });
      const { service } = buildDeps({ supabase });

      await expect(service.promote('request-1', { programId: 'program-1' } as never, 'moderator-1')).rejects.toThrow(
        'Cannot transition prayer request from ANSWERED to ASSIGNED',
      );
    });
  });

  describe('getMediaUrl', () => {
    it('throws when the request has no file of the requested kind', async () => {
      const supabase = createSupabaseServiceMock({
        prayer_requests: createQueryChain({ data: NEW_REQUEST, error: null }),
      });
      const { service } = buildDeps({ supabase });

      await expect(service.getMediaUrl('request-1', 'photo', true)).rejects.toThrow(
        'Prayer request request-1 has no photo',
      );
    });

    it('returns the signed URL when a photo exists and is ready', async () => {
      const supabase = createSupabaseServiceMock({
        prayer_requests: createQueryChain({ data: { ...NEW_REQUEST, photo_file_id: 'file-1' }, error: null }),
      });
      const filesService = { getPublicReadUrl: vi.fn().mockResolvedValue('https://signed.example/photo.jpg') };
      const { service } = buildDeps({ supabase, filesService });

      const url = await service.getMediaUrl('request-1', 'photo', true);

      expect(url).toBe('https://signed.example/photo.jpg');
    });
  });
});
