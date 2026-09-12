import { AiAgentsService } from './ai-agents.service';
import { createQueryChain, createSupabaseServiceMock } from '../testing/supabase-query-mock';

/** Every chat call logs to ai_interaction_logs regardless of outcome. */
function supabaseForLogging() {
  return createSupabaseServiceMock({ ai_interaction_logs: createQueryChain({ data: null, error: null }) });
}

function buildService(overrides: Partial<Record<string, unknown>> = {}) {
  const notificationsService = overrides.notificationsService ?? { create: vi.fn().mockResolvedValue(undefined) };
  const pushNotificationsService = overrides.pushNotificationsService ?? { send: vi.fn().mockResolvedValue([]) };
  const permissionsService =
    overrides.permissionsService ?? { listUserIdsWithAnyRole: vi.fn().mockResolvedValue([]) };
  const faithPathService =
    overrides.faithPathService ?? { get: vi.fn().mockResolvedValue({ current_step: 'DECOUVERTE', declared_level: null, updated_at: '2026-01-01T00:00:00.000Z' }) };
  const supabase = overrides.supabase ?? supabaseForLogging();
  const service = new AiAgentsService(
    supabase as never,
    notificationsService as never,
    pushNotificationsService as never,
    permissionsService as never,
    faithPathService as never,
  );
  return { service, notificationsService, pushNotificationsService, permissionsService, faithPathService, supabase };
}

describe('AiAgentsService.chatEvangelisation — crisis escalation', () => {
  it('detects a crisis keyword, returns the safe response, and notifies every MODERATEUR+ user', async () => {
    const { service, notificationsService, pushNotificationsService } = buildService({
      permissionsService: { listUserIdsWithAnyRole: vi.fn().mockResolvedValue(['moderator-1', 'pastor-1']) },
    });

    const result = await service.chatEvangelisation({ message: 'je veux me suicider', history: [] } as never, 'user-1');

    expect(result.escalated).toBe(true);
    expect(result.reply).toContain('services d\'urgence');
    expect(notificationsService.create).toHaveBeenCalledWith('moderator-1', 'AI_CRISIS_ESCALATION', { userId: 'user-1' });
    expect(notificationsService.create).toHaveBeenCalledWith('pastor-1', 'AI_CRISIS_ESCALATION', { userId: 'user-1' });
    expect(pushNotificationsService.send).toHaveBeenCalledTimes(2);
  });

  it('asks for the shared MODERATEUR+ role set', async () => {
    const listUserIdsWithAnyRole = vi.fn().mockResolvedValue([]);
    const { service } = buildService({ permissionsService: { listUserIdsWithAnyRole } });

    await service.chatEvangelisation({ message: 'abus sexuel', history: [] } as never, 'user-1');

    expect(listUserIdsWithAnyRole).toHaveBeenCalledWith([
      'MODERATEUR',
      'RESPONSABLE_EQUIPE',
      'PASTEUR',
      'ADMINISTRATEUR',
      'SUPER_ADMINISTRATEUR',
    ]);
  });

  it('still returns the safe response even when the recipient lookup fails', async () => {
    const { service, notificationsService } = buildService({
      permissionsService: { listUserIdsWithAnyRole: vi.fn().mockRejectedValue(new Error('db down')) },
    });

    const result = await service.chatEvangelisation({ message: 'automutilation', history: [] } as never, 'user-1');

    expect(result.escalated).toBe(true);
    expect(notificationsService.create).not.toHaveBeenCalled();
  });

  it('still returns the safe response even when notifying a recipient fails', async () => {
    const { service, notificationsService } = buildService({
      permissionsService: { listUserIdsWithAnyRole: vi.fn().mockResolvedValue(['moderator-1']) },
      notificationsService: { create: vi.fn().mockRejectedValue(new Error('notify failed')) },
    });

    const result = await service.chatEvangelisation({ message: 'en finir avec ma vie', history: [] } as never, 'user-1');

    expect(result.escalated).toBe(true);
    expect(notificationsService.create).toHaveBeenCalled();
  });

  it('does not escalate or notify anyone for an ordinary faith question', async () => {
    const { service, notificationsService, permissionsService } = buildService({
      permissionsService: { listUserIdsWithAnyRole: vi.fn().mockResolvedValue(['moderator-1']) },
    });
    // No ANTHROPIC_API_KEY in this test environment, so a non-crisis message hits getClient()'s
    // ServiceUnavailableException — proof enough that the crisis branch was correctly skipped.
    await expect(
      service.chatEvangelisation({ message: 'Que dit la Bible sur le pardon ?', history: [] } as never, 'user-1'),
    ).rejects.toThrow(/ANTHROPIC_API_KEY/);
    expect(notificationsService.create).not.toHaveBeenCalled();
    expect(permissionsService.listUserIdsWithAnyRole).not.toHaveBeenCalled();
  });
});

/**
 * Same technique already established for AiModerationService (see feedback_vitest_esm_mocking
 * memory): stub the env var so getClient() doesn't throw, then set the lazily-constructed
 * `client` field directly to a fake — no vi.mock('@anthropic-ai/sdk', ...) anywhere, since that
 * silently fails to intercept the real module once the full suite runs (documented gotcha).
 */
function fakeAnthropicReply(text: string) {
  return { content: [{ type: 'text', text }], stop_reason: 'end_turn' };
}

describe('AiAgentsService.chatAccueil — out-of-scope escalation', () => {
  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('strips the marker, escalates, and notifies support when the model signals out-of-scope', async () => {
    const { service, notificationsService, pushNotificationsService } = buildService({
      permissionsService: { listUserIdsWithAnyRole: vi.fn().mockResolvedValue(['moderator-1']) },
    });
    (service as unknown as { client: unknown }).client = {
      messages: { create: vi.fn().mockResolvedValue(fakeAnthropicReply('[HORS_PERIMETRE] Je ne peux pas répondre à cela.')) },
    };

    const result = await service.chatAccueil({ message: 'Quelle est la météo à Paris ?', history: [] } as never, 'user-1');

    expect(result.escalated).toBe(true);
    expect(result.reply).toBe('Je ne peux pas répondre à cela.');
    expect(notificationsService.create).toHaveBeenCalledWith('moderator-1', 'AI_ACCUEIL_ESCALATION', { userId: 'user-1' });
    expect(pushNotificationsService.send).toHaveBeenCalledTimes(1);
  });

  it('does not escalate or notify anyone for an ordinary operational question', async () => {
    const { service, notificationsService } = buildService();
    (service as unknown as { client: unknown }).client = {
      messages: { create: vi.fn().mockResolvedValue(fakeAnthropicReply('Pour rejoindre la salle, clique sur "Rejoindre la prière".')) },
    };

    const result = await service.chatAccueil({ message: 'Comment je rejoins la salle ?', history: [] } as never, 'user-1');

    expect(result.escalated).toBe(false);
    expect(result.reply).not.toContain('HORS_PERIMETRE');
    expect(notificationsService.create).not.toHaveBeenCalled();
  });
});

describe('AiAgentsService.chatEvangelisation — faith path context', () => {
  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('injects the current step and declared level into the system prompt for a logged-in user', async () => {
    const create = vi.fn().mockResolvedValue(fakeAnthropicReply('Réponse.'));
    const { service } = buildService({
      faithPathService: {
        get: vi.fn().mockResolvedValue({ current_step: 'EVANGILE', declared_level: 'CONNAIT_DEJA', updated_at: '2026-01-01T00:00:00.000Z' }),
      },
    });
    (service as unknown as { client: unknown }).client = { messages: { create } };

    await service.chatEvangelisation({ message: 'Que dit la Bible sur la grâce ?', history: [] } as never, 'user-1');

    const systemPrompt = create.mock.calls[0][0].system as string;
    expect(systemPrompt).toContain("L'Évangile");
    expect(systemPrompt).toContain('déjà bien connaître');
  });

  it('does not add any faith path context for an anonymous visitor', async () => {
    const create = vi.fn().mockResolvedValue(fakeAnthropicReply('Réponse.'));
    const { service, faithPathService } = buildService();
    (service as unknown as { client: unknown }).client = { messages: { create } };

    await service.chatEvangelisation({ message: 'Que dit la Bible sur la grâce ?', history: [] } as never, null);

    expect(faithPathService.get).not.toHaveBeenCalled();
    const systemPrompt = create.mock.calls[0][0].system as string;
    expect(systemPrompt).not.toContain('parcours de découverte');
  });

  it('still replies normally when the faith path lookup itself fails (fail-open)', async () => {
    const create = vi.fn().mockResolvedValue(fakeAnthropicReply('Réponse.'));
    const { service } = buildService({
      faithPathService: { get: vi.fn().mockRejectedValue(new Error('table missing')) },
    });
    (service as unknown as { client: unknown }).client = { messages: { create } };

    const result = await service.chatEvangelisation({ message: 'Que dit la Bible sur la grâce ?', history: [] } as never, 'user-1');

    expect(result.reply).toBe('Réponse.');
    const systemPrompt = create.mock.calls[0][0].system as string;
    expect(systemPrompt).not.toContain('parcours de découverte');
  });
});
