import { MfaOtpService } from './mfa-otp.service';
import { PasswordService } from '../access/password.service';
import { createQueryChain, createSupabaseServiceMock } from '../testing/supabase-query-mock';
import { User } from '../users/user.entity';

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'believer@example.com',
    phone: '+225000',
    password_hash: 'hashed',
    display_name: 'Believer',
    avatar_file_id: null,
    locale: 'fr',
    timezone: 'UTC',
    status: 'ACTIVE',
    mfa_enabled: true,
    email_verified_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    deleted_at: null,
    ...overrides,
  };
}

function buildService(chain: ReturnType<typeof createQueryChain>, overrides: Partial<Record<string, unknown>> = {}) {
  const supabase = createSupabaseServiceMock({ mfa_otp_challenges: chain });
  const passwordService = new PasswordService();
  const emailService = overrides.emailService ?? { send: vi.fn().mockResolvedValue(undefined) };
  const whatsAppService = overrides.whatsAppService ?? { send: vi.fn().mockResolvedValue(undefined) };
  const service = new MfaOtpService(supabase as never, passwordService, emailService as never, whatsAppService as never);
  return { service, emailService, whatsAppService };
}

describe('MfaOtpService', () => {
  describe('request', () => {
    it('sends a 6-digit code by email and invalidates any prior pending challenge', async () => {
      const chain = createQueryChain({ data: null, error: null });
      const { service, emailService } = buildService(chain);

      await service.request(buildUser(), 'EMAIL');

      expect(chain.delete).toHaveBeenCalled();
      expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1');
      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: 'user-1', channel: 'EMAIL' }),
      );
      const [, , body] = emailService.send.mock.calls[0];
      expect(body).toMatch(/\d{6}/);
    });

    it('sends via WhatsApp when requested', async () => {
      const chain = createQueryChain({ data: null, error: null });
      const { service, whatsAppService } = buildService(chain);

      await service.request(buildUser(), 'WHATSAPP');

      expect(whatsAppService.send).toHaveBeenCalledWith('+225000', expect.stringMatching(/\d{6}/), 'user-1');
    });

    it('rejects WhatsApp OTP when the user has no phone on file', async () => {
      const chain = createQueryChain({ data: null, error: null });
      const { service } = buildService(chain);

      await expect(service.request(buildUser({ phone: null }), 'WHATSAPP')).rejects.toThrow(
        'No phone number on file',
      );
    });
  });

  describe('verify', () => {
    it('consumes a matching unused, unexpired code', async () => {
      const passwordService = new PasswordService();
      const hash = await passwordService.hash('123456');
      const chain = createQueryChain({ data: [{ id: 'challenge-1', code_hash: hash }], error: null });
      const supabase = createSupabaseServiceMock({ mfa_otp_challenges: chain });
      const service = new MfaOtpService(
        supabase as never,
        passwordService,
        { send: vi.fn() } as never,
        { send: vi.fn() } as never,
      );

      const result = await service.verify('user-1', '123456');

      expect(result).toBe(true);
      expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({ used_at: expect.any(String) }));
      expect(chain.eq).toHaveBeenCalledWith('id', 'challenge-1');
    });

    it('returns false when no unexpired challenge matches', async () => {
      const chain = createQueryChain({ data: [], error: null });
      const { service } = buildService(chain);

      const result = await service.verify('user-1', '123456');

      expect(result).toBe(false);
    });

    it('only considers unused, unexpired challenges', async () => {
      const chain = createQueryChain({ data: [], error: null });
      const { service } = buildService(chain);

      await service.verify('user-1', '123456');

      expect(chain.is).toHaveBeenCalledWith('used_at', null);
      expect(chain.gt).toHaveBeenCalledWith('expires_at', expect.any(String));
    });
  });
});
