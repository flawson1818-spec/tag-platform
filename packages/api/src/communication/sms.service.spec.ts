import { maskPhone, SmsService, toE164 } from './sms.service';

const ENV_KEYS = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER', 'TWILIO_MESSAGING_SERVICE_SID'];

describe('SmsService', () => {
  const saved: Record<string, string | undefined> = {};
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    vi.unstubAllGlobals();
  });

  function configure(extra: Record<string, string> = { TWILIO_FROM_NUMBER: '+15005550006' }) {
    process.env.TWILIO_ACCOUNT_SID = 'AC123';
    process.env.TWILIO_AUTH_TOKEN = 'secret';
    Object.assign(process.env, extra);
  }

  it('is disabled until credentials and a sender are all set', () => {
    const service = new SmsService();
    expect(service.isConfigured()).toBe(false);
    process.env.TWILIO_ACCOUNT_SID = 'AC123';
    process.env.TWILIO_AUTH_TOKEN = 'secret';
    expect(service.isConfigured()).toBe(false);
    process.env.TWILIO_MESSAGING_SERVICE_SID = 'MG1';
    expect(service.isConfigured()).toBe(true);
  });

  it('refuses to send when not configured, without calling the network', async () => {
    await expect(new SmsService().send('+2250701020304', 'x')).rejects.toThrow('pas configuré');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts a form-encoded message to Twilio with basic auth', async () => {
    configure();
    fetchMock.mockResolvedValue({ ok: true, text: async () => '{}' });

    await new SmsService().send('+2250701020304', 'Ton code : 123456');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json');
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from('AC123:secret').toString('base64')}`);
    const form = new URLSearchParams(init.body);
    expect(form.get('To')).toBe('+2250701020304');
    expect(form.get('From')).toBe('+15005550006');
    expect(form.get('Body')).toBe('Ton code : 123456');
  });

  it('prefers a Messaging Service over a raw sender number', async () => {
    configure({ TWILIO_FROM_NUMBER: '+15005550006', TWILIO_MESSAGING_SERVICE_SID: 'MG1' });
    fetchMock.mockResolvedValue({ ok: true, text: async () => '{}' });

    await new SmsService().send('+2250701020304', 'x');

    const form = new URLSearchParams(fetchMock.mock.calls[0][1].body);
    expect(form.get('MessagingServiceSid')).toBe('MG1');
    expect(form.has('From')).toBe(false);
  });

  it('turns a provider rejection or network failure into a 503', async () => {
    configure();
    fetchMock.mockResolvedValueOnce({ ok: false, status: 400, text: async () => '{"code":21211}' });
    await expect(new SmsService().send('+2250701020304', 'x')).rejects.toThrow("n'a pas pu être envoyé");

    fetchMock.mockRejectedValueOnce(new Error('timeout'));
    await expect(new SmsService().send('+2250701020304', 'x')).rejects.toThrow("n'a pas pu être envoyé");
  });

  it('normalizes international numbers and rejects local ones', () => {
    expect(toE164('+225 07 01 02 03 04')).toBe('+2250701020304');
    expect(toE164('+1 (415) 555-0100')).toBe('+14155550100');
    expect(toE164('0701020304')).toBeNull();
    expect(toE164(null)).toBeNull();
  });

  it('masks phone numbers for logs', () => {
    expect(maskPhone('+2250701020304')).toBe('+225••••••0304');
  });
});
