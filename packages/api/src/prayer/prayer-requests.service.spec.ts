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
  const programsService =
    overrides.programsService ?? { findById: vi.fn().mockResolvedValue({ id: 'program-1', community_id: 'community-1' }) };
  const gateway = overrides.gateway ?? { emitSlotStarted: vi.fn(), emitSlotEnded: vi.fn() };
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
    programsService as never,
    gateway as never,
    notificationsService as never,
    pushNotificationsService as never,
    aiModerationService as never,
    aiAgentsService as never,
    filesService as never,
  );
  return {
    service,
    slotsService,
    programsService,
    gateway,
    notificationsService,
    pushNotificationsService,
    aiModerationService,
    aiAgentsService,
    filesService,
    supabase,
  };
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

  describe('list — mine filter', () => {
    it('filters to the caller\'s own author_id when mine is set, ignoring canSeePrivate', async () => {
      const chain = createQueryChain({ data: [NEW_REQUEST], error: null, count: 1 });
      const supabase = createSupabaseServiceMock({ prayer_requests: chain });
      const { service } = buildDeps({ supabase });

      await service.list({ mine: true } as never, false, 'user-1');

      expect(chain.eq).toHaveBeenCalledWith('author_id', 'user-1');
      expect(chain.neq).not.toHaveBeenCalledWith('confidentiality', 'PRIVATE');
    });

    it("a member only ever sees their own requests, never other people's", async () => {
      const chain = createQueryChain({ data: [NEW_REQUEST], error: null, count: 1 });
      const supabase = createSupabaseServiceMock({ prayer_requests: chain });
      const { service } = buildDeps({ supabase });

      await service.list({} as never, false, 'user-1');

      expect(chain.eq).toHaveBeenCalledWith('author_id', 'user-1');
    });

    it('the administration receives every request, with who asked and who carries it', async () => {
      const chain = createQueryChain({
        data: [{ ...NEW_REQUEST, confidentiality: 'PUBLIC', author: { display_name: 'Marie' }, assignee: { display_name: 'Paul' } }],
        error: null,
        count: 1,
      });
      const supabase = createSupabaseServiceMock({ prayer_requests: chain });
      const { service } = buildDeps({ supabase });

      const page = await service.list({} as never, true, 'admin-1');

      expect(chain.eq).not.toHaveBeenCalledWith('author_id', expect.anything());
      expect(page.data[0]).toMatchObject({ author_display_name: 'Marie', assignee_display_name: 'Paul' });
    });

    it('an intercessor sees the requests entrusted to them', async () => {
      const chain = createQueryChain({ data: [], error: null, count: 0 });
      const supabase = createSupabaseServiceMock({ prayer_requests: chain });
      const { service } = buildDeps({ supabase });

      await service.list({ assignedToMe: true } as never, false, 'int-1');

      expect(chain.eq).toHaveBeenCalledWith('assigned_to', 'int-1');
    });
  });

  describe('assign', () => {
    it('entrusts a NEW request to an intercessor and tells them', async () => {
      const update = createQueryChain({ data: { ...NEW_REQUEST, status: 'ASSIGNED' }, error: null });
      const supabase = createSupabaseServiceMock({
        prayer_requests: [createQueryChain({ data: NEW_REQUEST, error: null }), update],
      });
      const deps = buildDeps({ supabase });

      await deps.service.assign(NEW_REQUEST.id, 'int-1', 'admin-1');

      expect(update.update).toHaveBeenCalledWith(expect.objectContaining({ assigned_to: 'int-1', status: 'ASSIGNED' }));
      expect(deps.notificationsService.create).toHaveBeenCalledWith('int-1', 'PRAYER_REQUEST_ASSIGNED', {
        prayerRequestId: NEW_REQUEST.id,
      });
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
    it('reads the request first, then its verse, then a simple prayer when the AI is unavailable', async () => {
      const supabase = createSupabaseServiceMock({
        prayer_requests: [
          createQueryChain({ data: NEW_REQUEST, error: null }),
          createQueryChain({ data: { ...NEW_REQUEST, status: 'ASSIGNED', promoted_slot_id: 'slot-1' }, error: null }),
        ],
      });
      const slotsService = {
        injectUrgent: vi.fn().mockResolvedValue({ interrupted: null, activated: { id: 'slot-1' } }),
      };
      const { service } = buildDeps({ supabase, slotsService });

      await service.promote('request-1', { programId: 'program-1' } as never, 'moderator-1');

      expect(slotsService.injectUrgent).toHaveBeenCalledWith(
        'program-1',
        expect.objectContaining({
          category: 'Famille',
          guidedText: expect.stringMatching(/^Sujet de prière : /),
          bibleReferences: [expect.stringMatching(/^Josué 24:15 — /)],
        }),
      );
    });

    it('uses the AI-generated guided text when available instead of the placeholder', async () => {
      const supabase = createSupabaseServiceMock({
        prayer_requests: [
          createQueryChain({ data: NEW_REQUEST, error: null }),
          createQueryChain({ data: { ...NEW_REQUEST, status: 'ASSIGNED' }, error: null }),
        ],
      });
      const slotsService = {
        injectUrgent: vi.fn().mockResolvedValue({ interrupted: null, activated: { id: 'slot-1' } }),
      };
      const aiAgentsService = { draftGuidedPrayer: vi.fn().mockResolvedValue('Prions avec confiance pour cette famille.') };
      const { service } = buildDeps({ supabase, slotsService, aiAgentsService });

      await service.promote('request-1', { programId: 'program-1' } as never, 'moderator-1');

      expect(slotsService.injectUrgent).toHaveBeenCalledWith(
        'program-1',
        expect.objectContaining({
          guidedText: expect.stringMatching(/^Sujet de prière : [\s\S]*\n\nPrions avec confiance pour cette famille\.$/),
        }),
      );
    });

    it('maps an unlisted category to Autre', async () => {
      const supabase = createSupabaseServiceMock({
        prayer_requests: [
          createQueryChain({ data: { ...NEW_REQUEST, category: 'Visa' }, error: null }),
          createQueryChain({ data: { ...NEW_REQUEST, status: 'ASSIGNED' }, error: null }),
        ],
      });
      const slotsService = {
        injectUrgent: vi.fn().mockResolvedValue({ interrupted: null, activated: { id: 'slot-1' } }),
      };
      const { service } = buildDeps({ supabase, slotsService });

      await service.promote('request-1', { programId: 'program-1' } as never, 'moderator-1');

      expect(slotsService.injectUrgent).toHaveBeenCalledWith('program-1', expect.objectContaining({ category: 'Autre' }));
    });

    it('cuts the current slot short and broadcasts both the end and the urgent start immediately', async () => {
      const supabase = createSupabaseServiceMock({
        prayer_requests: [
          createQueryChain({ data: NEW_REQUEST, error: null }),
          createQueryChain({ data: { ...NEW_REQUEST, status: 'ASSIGNED', promoted_slot_id: 'slot-urgent' }, error: null }),
        ],
      });
      const slotsService = {
        injectUrgent: vi.fn().mockResolvedValue({
          interrupted: { id: 'slot-current' },
          activated: { id: 'slot-urgent' },
        }),
      };
      const gateway = { emitSlotStarted: vi.fn(), emitSlotEnded: vi.fn() };
      const programsService = { findById: vi.fn().mockResolvedValue({ id: 'program-1', community_id: 'community-1' }) };
      const { service } = buildDeps({ supabase, slotsService, gateway, programsService });

      const result = await service.promote('request-1', { programId: 'program-1' } as never, 'moderator-1');

      expect(gateway.emitSlotEnded).toHaveBeenCalledWith('community-1', 'slot-current');
      expect(gateway.emitSlotStarted).toHaveBeenCalledWith('community-1', { id: 'slot-urgent' }, expect.any(Number));
      expect(result.promoted_slot_id).toBe('slot-urgent');
    });

    it('does not emit slot:ended when nothing was running to interrupt', async () => {
      const supabase = createSupabaseServiceMock({
        prayer_requests: [
          createQueryChain({ data: NEW_REQUEST, error: null }),
          createQueryChain({ data: { ...NEW_REQUEST, status: 'ASSIGNED' }, error: null }),
        ],
      });
      const slotsService = {
        injectUrgent: vi.fn().mockResolvedValue({ interrupted: null, activated: { id: 'slot-urgent' } }),
      };
      const gateway = { emitSlotStarted: vi.fn(), emitSlotEnded: vi.fn() };
      const { service } = buildDeps({ supabase, slotsService, gateway });

      await service.promote('request-1', { programId: 'program-1' } as never, 'moderator-1');

      expect(gateway.emitSlotEnded).not.toHaveBeenCalled();
      expect(gateway.emitSlotStarted).toHaveBeenCalled();
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

  describe('« Je prie pour ce sujet » (§5.7)', () => {
    it('never carries into the room a request its author did not make public', async () => {
      const supabase = createSupabaseServiceMock({
        prayer_requests: createQueryChain({ data: { ...NEW_REQUEST, confidentiality: 'PRIVATE' }, error: null }),
      });
      const { service, slotsService } = buildDeps({ supabase });
      await expect(service.promote('r1', { programId: 'p1' } as never, 'admin')).rejects.toThrow(/Public/);
      expect((slotsService as { injectUrgent?: unknown }).injectUrgent).toBeUndefined();
    });

    it('counts a prayer once per person, only for a request carried in the room', async () => {
      const notCarried = buildDeps({
        supabase: createSupabaseServiceMock({ prayer_requests: createQueryChain({ data: { id: 'r1', promoted_slot_id: null }, error: null }) }),
      });
      await expect(notCarried.service.pray('r1', 'u1')).rejects.toThrow(/pas portée/);

      const prayers = createQueryChain({ data: [{ prayer_request_id: 'r1', user_id: 'u1' }, { prayer_request_id: 'r1', user_id: 'u2' }], error: null });
      const carried = buildDeps({
        supabase: createSupabaseServiceMock({
          prayer_requests: createQueryChain({ data: { id: 'r1', promoted_slot_id: 's1' }, error: null }),
          prayer_request_prayers: prayers,
        }),
        slotsService: { findById: vi.fn().mockResolvedValue({ id: 's1', program_id: 'p1' }) },
        gateway: { emitRequestPrayed: vi.fn() },
      });
      await expect(carried.service.pray('r1', 'u1')).resolves.toEqual({ count: 2, prayedByMe: true });
      expect(prayers.upsert).toHaveBeenCalledWith(
        { prayer_request_id: 'r1', user_id: 'u1' },
        expect.objectContaining({ ignoreDuplicates: true }),
      );
      expect((carried.gateway as { emitRequestPrayed: ReturnType<typeof vi.fn> }).emitRequestPrayed).toHaveBeenCalledWith('community-1', 'r1', 2);
    });
  });
});
