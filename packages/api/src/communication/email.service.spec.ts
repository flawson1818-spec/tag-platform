import { EmailService } from './email.service';
import { createQueryChain, createSupabaseServiceMock } from '../testing/supabase-query-mock';

describe('EmailService', () => {
  function build() {
    const chain = createQueryChain({ data: { id: 'em-1', status: 'CREATED' }, error: null });
    const service = new EmailService(createSupabaseServiceMock({ emails: chain }) as never);
    return { service, chain };
  }

  it('records the message at status CREATED — nothing claims a send that never happened', async () => {
    const { service, chain } = build();

    await service.send('a@example.com', 'Bienvenue', 'Bonjour', 'user-1');

    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ to_email: 'a@example.com', body: 'Bonjour', status: 'CREATED', sent_at: null }),
    );
  });

  it('never stores a reset or verification token in plaintext', async () => {
    const { service, chain } = build();

    await service.send('a@example.com', 'Réinitialisation', 'Voici votre code : tok_abc123 (valable 1 heure).', 'user-1', {
      secret: 'tok_abc123',
    });

    const row = (chain.insert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(row.body).toBe('Voici votre code : [masqué] (valable 1 heure).');
    expect(JSON.stringify(row)).not.toContain('tok_abc123');
  });
});
