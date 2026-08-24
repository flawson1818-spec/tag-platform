import { createQueryChain, createSupabaseServiceMock } from '../testing/supabase-query-mock';
import { AiModerationService } from './ai-moderation.service';

/**
 * Sets a fake client directly on the service's lazily-constructed `client` field instead of
 * vi.mock()-ing '@anthropic-ai/sdk'. Module-level mocking of this package proved unreliable
 * here (mocks silently missed real calls in a handful of tests, only reproducible when the
 * project's nx-driven test run executed many spec files together — never in isolation, and
 * not fixed by clearing the Vite dep cache or disabling file parallelism). Field injection
 * sidesteps the whole class of problem: the real Anthropic constructor never runs, so nothing
 * needs to intercept it.
 */
function buildService(createMock: ReturnType<typeof vi.fn>, perTable: Record<string, unknown> = {}) {
  const supabase = createSupabaseServiceMock(perTable as never);
  const service = new AiModerationService(supabase as never);
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
  (service as unknown as { client: unknown }).client = { messages: { create: createMock } };
  return service;
}

describe('AiModerationService', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the safe default for blank text without calling the API', async () => {
    const createMock = vi.fn();
    const service = buildService(createMock);

    const result = await service.moderate('   ');

    expect(result).toEqual({ flagged: false, confidence: 0, reason: null, critical: false });
    expect(createMock).not.toHaveBeenCalled();
  });

  it('returns the safe default when ANTHROPIC_API_KEY is not configured', async () => {
    const createMock = vi.fn();
    const supabase = createSupabaseServiceMock({});
    const service = new AiModerationService(supabase as never);
    vi.stubEnv('ANTHROPIC_API_KEY', '');

    const result = await service.moderate('bonjour');

    expect(result.flagged).toBe(false);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('parses a flagged classification and logs the interaction for a human audit trail', async () => {
    const createMock = vi.fn().mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: '{"flagged":true,"confidence":0.92,"reason":"Insultes","critical":false}' }],
    });
    const logChain = createQueryChain({ data: null, error: null });
    const service = buildService(createMock, { ai_interaction_logs: logChain });

    const result = await service.moderate('texte insultant', 'user-1');

    expect(result).toEqual({ flagged: true, confidence: 0.92, reason: 'Insultes', critical: false });
    expect(logChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ agent: 'MODERATION', user_id: 'user-1', escalated_to_human: false }),
    );
  });

  it('does not log anything when content is not flagged', async () => {
    const createMock = vi.fn().mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: '{"flagged":false,"confidence":0.05,"reason":null,"critical":false}' }],
    });
    const service = buildService(createMock);

    const result = await service.moderate('Dieu a guéri ma famille');

    expect(result.flagged).toBe(false);
  });

  it('marks escalated_to_human when the classification is critical', async () => {
    const createMock = vi.fn().mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: '{"flagged":true,"confidence":0.99,"reason":"Menace grave","critical":true}' }],
    });
    const logChain = createQueryChain({ data: null, error: null });
    const service = buildService(createMock, { ai_interaction_logs: logChain });

    const result = await service.moderate('texte dangereux');

    expect(result.critical).toBe(true);
    expect(logChain.insert).toHaveBeenCalledWith(expect.objectContaining({ escalated_to_human: true }));
  });

  it('returns the safe default when the model refuses to answer', async () => {
    const createMock = vi.fn().mockResolvedValue({ stop_reason: 'refusal', content: [] });
    const service = buildService(createMock);

    const result = await service.moderate('texte');

    expect(result.flagged).toBe(false);
  });

  it('returns the safe default when the API call throws', async () => {
    const createMock = vi.fn().mockRejectedValue(new Error('network error'));
    const service = buildService(createMock);

    const result = await service.moderate('texte');

    expect(result.flagged).toBe(false);
  });

  it('returns the safe default when the response is not valid JSON', async () => {
    const createMock = vi.fn().mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'not json at all' }] });
    const service = buildService(createMock);

    const result = await service.moderate('texte');

    expect(result.flagged).toBe(false);
  });
});
