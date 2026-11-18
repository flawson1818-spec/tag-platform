import { WELCOME_SENDER_ID, welcomeText } from './welcome-message';
import { WelcomeService } from './welcome.service';
import { createQueryChain, createSupabaseServiceMock } from '../testing/supabase-query-mock';

describe('welcome message', () => {
  it('greets by name, in the member language, with Scripture; French by default', () => {
    expect(welcomeText('en', 'John')).toContain('Welcome John');
    expect(welcomeText('es-ES', 'Ana')).toContain('Mateo 18:20');
    expect(welcomeText('de', 'Hans')).toContain('Bienvenue Hans');
    expect(welcomeText(null, '')).toContain('Bienvenue ami(e)');
    expect(welcomeText('fr', 'Marie')).toContain('Matthieu 18:20');
  });

  it('puts one message in the inbox of a new member, from the platform account', async () => {
    const users = createQueryChain({ data: { id: WELCOME_SENDER_ID }, error: null });
    const conversations = createQueryChain({ data: { id: 'c1' }, error: null });
    conversations.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const messages = createQueryChain({ data: null, error: null });
    const service = new WelcomeService(createSupabaseServiceMock({ users, conversations, direct_messages: messages }) as never);

    await service.welcome({ id: 'ffffffff-0000-4000-8000-000000000001', display_name: 'Marie', locale: 'fr' });

    expect(messages.insert).toHaveBeenCalledWith(expect.objectContaining({ conversation_id: 'c1', sender_id: WELCOME_SENDER_ID, content: expect.stringContaining('Bienvenue Marie') }));
  });

  it('does nothing, and never fails, when the platform account does not exist yet', async () => {
    const users = createQueryChain({ data: null, error: null });
    const messages = createQueryChain({ data: null, error: null });
    const service = new WelcomeService(createSupabaseServiceMock({ users, direct_messages: messages }) as never);

    await expect(service.welcome({ id: 'x', display_name: 'A' })).resolves.toBeUndefined();
    expect(messages.insert).not.toHaveBeenCalled();
  });
});
