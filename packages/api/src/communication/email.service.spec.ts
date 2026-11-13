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

describe('EmailService with Brevo configured', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
    vi.unstubAllGlobals();
  });

  function build(fetchImpl: () => Promise<Response>) {
    process.env.BREVO_API_KEY = 'xkeysib-test';
    process.env.EMAIL_FROM = 'tour@example.com';
    const fetchMock = vi.fn(fetchImpl);
    vi.stubGlobal('fetch', fetchMock);
    const chain = createQueryChain({ data: { id: 'em-1', status: 'SENT' }, error: null });
    const service = new EmailService(createSupabaseServiceMock({ emails: chain }) as never);
    return { service, chain, fetchMock };
  }

  it('sends the real text to the provider, stores it redacted, at status SENT', async () => {
    const { service, chain, fetchMock } = build(async () => new Response('{}', { status: 201 }));

    await service.send('a@example.com', 'Code', 'Ton code : 123456 (valable 10 minutes).', 'user-1', { secret: '123456' });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(JSON.parse(init.body as string)).toMatchObject({
      sender: { email: 'tour@example.com', name: "Tour d'avant-garde" },
      to: [{ email: 'a@example.com' }],
      textContent: 'Ton code : 123456 (valable 10 minutes).',
    });
    const row = (chain.insert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(row).toMatchObject({ status: 'SENT', body: 'Ton code : [masqué] (valable 10 minutes).' });
  });

  it('records FAILED without throwing when the provider refuses', async () => {
    const { service, chain } = build(async () => new Response('unauthorized', { status: 401 }));
    await expect(service.send('a@example.com', 'Bienvenue', 'Bonjour')).resolves.toBeDefined();
    expect((chain.insert as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({ status: 'FAILED', sent_at: null });
  });
});

describe('EmailService with Gmail (Apps Script) configured', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
    vi.unstubAllGlobals();
  });

  function build(fetchImpl: () => Promise<Response>, url = 'https://script.google.com/macros/s/abc/exec') {
    process.env.EMAIL_RELAY_URL = url;
    process.env.EMAIL_RELAY_SECRET = 'phrase';
    process.env.BREVO_API_KEY = 'xkeysib-test';
    process.env.EMAIL_FROM = 'tour@example.com';
    const fetchMock = vi.fn(fetchImpl);
    vi.stubGlobal('fetch', fetchMock);
    const chain = createQueryChain({ data: { id: 'em-1', status: 'SENT' }, error: null });
    const service = new EmailService(createSupabaseServiceMock({ emails: chain }) as never);
    return { service, chain, fetchMock };
  }

  it('sends through Gmail before Brevo, with the shared secret, over HTTPS', async () => {
    const { service, chain, fetchMock } = build(async () => new Response('{"ok":true}', { status: 200 }));
    await service.send('a@example.com', 'Bienvenue', 'Bonjour');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://script.google.com/macros/s/abc/exec');
    expect(JSON.parse(init.body as string)).toMatchObject({ secret: 'phrase', to: 'a@example.com', subject: 'Bienvenue', body: 'Bonjour' });
    expect((chain.insert as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({ status: 'SENT' });
  });

  it('records FAILED when the script refuses (wrong secret, quota reached)', async () => {
    const { service, chain } = build(async () => new Response('{"ok":false,"error":"secret"}', { status: 200 }));
    await service.send('a@example.com', 'Bienvenue', 'Bonjour');
    expect((chain.insert as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({ status: 'FAILED' });
  });

  it('never posts the secret anywhere but script.google.com', async () => {
    const { service, fetchMock } = build(async () => new Response('{}', { status: 201 }), 'https://evil.example/collect');
    await service.send('a@example.com', 'Bienvenue', 'Bonjour');
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('https://api.brevo.com/v3/smtp/email');
  });
});
