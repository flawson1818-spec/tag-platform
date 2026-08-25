import { AiAgentsService } from './ai-agents.service';
import { createQueryChain, createSupabaseServiceMock } from '../testing/supabase-query-mock';

/** Every chatEvangelisation call logs to ai_interaction_logs regardless of outcome. */
function supabaseWithRoleAssignments(roleAssignmentsChain: ReturnType<typeof createQueryChain>) {
  return createSupabaseServiceMock({
    role_assignments: roleAssignmentsChain,
    ai_interaction_logs: createQueryChain({ data: null, error: null }),
  });
}

function buildService(overrides: Partial<Record<string, unknown>> = {}) {
  const notificationsService = overrides.notificationsService ?? { create: vi.fn().mockResolvedValue(undefined) };
  const pushNotificationsService = overrides.pushNotificationsService ?? { send: vi.fn().mockResolvedValue([]) };
  const supabase = overrides.supabase ?? createSupabaseServiceMock({});
  const service = new AiAgentsService(supabase as never, notificationsService as never, pushNotificationsService as never);
  return { service, notificationsService, pushNotificationsService, supabase };
}

describe('AiAgentsService.chatEvangelisation — crisis escalation', () => {
  it('detects a crisis keyword, returns the safe response, and notifies every MODERATEUR+ user', async () => {
    const roleAssignmentsChain = createQueryChain({
      data: [
        { user_id: 'moderator-1', roles: { code: 'MODERATEUR' } },
        { user_id: 'pastor-1', roles: { code: 'PASTEUR' } },
      ],
      error: null,
    });
    const { service, notificationsService, pushNotificationsService } = buildService({
      supabase: supabaseWithRoleAssignments(roleAssignmentsChain),
    });

    const result = await service.chatEvangelisation({ message: 'je veux me suicider', history: [] } as never, 'user-1');

    expect(result.escalated).toBe(true);
    expect(result.reply).toContain('services d\'urgence');
    expect(notificationsService.create).toHaveBeenCalledWith('moderator-1', 'AI_CRISIS_ESCALATION', { userId: 'user-1' });
    expect(notificationsService.create).toHaveBeenCalledWith('pastor-1', 'AI_CRISIS_ESCALATION', { userId: 'user-1' });
    expect(pushNotificationsService.send).toHaveBeenCalledTimes(2);
  });

  it('deduplicates a recipient who holds more than one eligible role', async () => {
    const roleAssignmentsChain = createQueryChain({
      data: [
        { user_id: 'moderator-1', roles: { code: 'MODERATEUR' } },
        { user_id: 'moderator-1', roles: { code: 'PASTEUR' } },
      ],
      error: null,
    });
    const { service, notificationsService } = buildService({
      supabase: supabaseWithRoleAssignments(roleAssignmentsChain),
    });

    await service.chatEvangelisation({ message: 'il me frappe', history: [] } as never, 'user-1');

    expect(notificationsService.create).toHaveBeenCalledTimes(1);
  });

  it('still returns the safe response even when the recipient lookup fails', async () => {
    const roleAssignmentsChain = createQueryChain({ data: null, error: { message: 'db down' } });
    const { service, notificationsService } = buildService({
      supabase: supabaseWithRoleAssignments(roleAssignmentsChain),
    });

    const result = await service.chatEvangelisation({ message: 'automutilation', history: [] } as never, 'user-1');

    expect(result.escalated).toBe(true);
    expect(notificationsService.create).not.toHaveBeenCalled();
  });

  it('still returns the safe response even when notifying a recipient fails', async () => {
    const roleAssignmentsChain = createQueryChain({
      data: [{ user_id: 'moderator-1', roles: { code: 'MODERATEUR' } }],
      error: null,
    });
    const { service, notificationsService } = buildService({
      supabase: supabaseWithRoleAssignments(roleAssignmentsChain),
      notificationsService: { create: vi.fn().mockRejectedValue(new Error('notify failed')) },
    });

    const result = await service.chatEvangelisation({ message: 'en finir avec ma vie', history: [] } as never, 'user-1');

    expect(result.escalated).toBe(true);
    expect(notificationsService.create).toHaveBeenCalled();
  });

  it('does not escalate or notify anyone for an ordinary faith question', async () => {
    const roleAssignmentsChain = createQueryChain({ data: [{ user_id: 'moderator-1', roles: { code: 'MODERATEUR' } }], error: null });
    const { notificationsService, supabase } = buildService({
      supabase: supabaseWithRoleAssignments(roleAssignmentsChain),
    });
    // No ANTHROPIC_API_KEY in this test environment, so a non-crisis message hits getClient()'s
    // ServiceUnavailableException — proof enough that the crisis branch was correctly skipped.
    const service = new AiAgentsService(supabase as never, notificationsService as never, { send: vi.fn() } as never);

    await expect(
      service.chatEvangelisation({ message: 'Que dit la Bible sur le pardon ?', history: [] } as never, 'user-1'),
    ).rejects.toThrow(/ANTHROPIC_API_KEY/);
    expect(notificationsService.create).not.toHaveBeenCalled();
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
    const roleAssignmentsChain = createQueryChain({
      data: [{ user_id: 'moderator-1', roles: { code: 'MODERATEUR' } }],
      error: null,
    });
    const { service, notificationsService, pushNotificationsService } = buildService({
      supabase: supabaseWithRoleAssignments(roleAssignmentsChain),
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
    const { service, notificationsService } = buildService({
      supabase: supabaseWithRoleAssignments(createQueryChain({ data: [], error: null })),
    });
    (service as unknown as { client: unknown }).client = {
      messages: { create: vi.fn().mockResolvedValue(fakeAnthropicReply('Pour rejoindre la salle, clique sur "Rejoindre la prière".')) },
    };

    const result = await service.chatAccueil({ message: 'Comment je rejoins la salle ?', history: [] } as never, 'user-1');

    expect(result.escalated).toBe(false);
    expect(result.reply).not.toContain('HORS_PERIMETRE');
    expect(notificationsService.create).not.toHaveBeenCalled();
  });
});
