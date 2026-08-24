import { AuthService } from './auth.service';
import { User } from '../users/user.entity';
import { createQueryChain, createSupabaseServiceMock } from '../testing/supabase-query-mock';

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'believer@example.com',
    phone: null,
    password_hash: 'hashed',
    display_name: 'Believer',
    avatar_file_id: null,
    locale: 'fr',
    timezone: 'UTC',
    status: 'ACTIVE',
    mfa_enabled: false,
    email_verified_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    deleted_at: null,
    ...overrides,
  };
}

function buildDeps(overrides: Partial<Record<string, unknown>> = {}) {
  const usersService = {
    findByEmail: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    updatePasswordHash: vi.fn(),
    getMfaSecret: vi.fn(),
    setMfaSecret: vi.fn().mockResolvedValue(undefined),
    setMfaEnabled: vi.fn().mockResolvedValue(undefined),
  };
  const rolesService = { assignSystemDefaultRole: vi.fn().mockResolvedValue(undefined) };
  const passwordService = { hash: vi.fn(), verify: vi.fn() };
  const tokenService = {
    createAccessToken: vi.fn(() => 'access-token'),
    verifyAccessToken: vi.fn(),
    createMfaPendingToken: vi.fn(() => 'mfa-pending-token'),
    verifyMfaPendingToken: vi.fn(),
    createRefreshTokenPair: vi.fn(() => ({
      token: 'raw-refresh-token',
      hash: 'hashed-refresh-token',
      expiresAt: new Date('2026-02-01T00:00:00.000Z'),
    })),
    hashToken: vi.fn((raw: string) => `hash(${raw})`),
    accessTokenExpiresInSeconds: 900,
  };
  const emailService = { send: vi.fn().mockResolvedValue(undefined) };
  const mfaService = { generateSecret: vi.fn(), keyUri: vi.fn(), verify: vi.fn() };
  const supabase = createSupabaseServiceMock({
    refresh_tokens: createQueryChain({ data: null, error: null }),
    password_reset_tokens: createQueryChain({ data: null, error: null }),
    email_verification_tokens: createQueryChain({ data: null, error: null }),
    users: createQueryChain({ data: null, error: null }),
  });

  const deps = {
    usersService,
    rolesService,
    passwordService,
    tokenService,
    emailService,
    mfaService,
    supabase,
    ...overrides,
  };
  const service = new AuthService(
    deps.usersService as never,
    deps.rolesService as never,
    deps.passwordService as never,
    deps.tokenService as never,
    deps.emailService as never,
    deps.mfaService as never,
    deps.supabase as never,
  );
  return { service, ...deps };
}

describe('AuthService', () => {
  describe('register', () => {
    it('rejects a duplicate email', async () => {
      const { service, usersService } = buildDeps();
      usersService.findByEmail.mockResolvedValue(buildUser());

      await expect(
        service.register({ email: 'believer@example.com', password: 'x', displayName: 'B' } as never),
      ).rejects.toThrow('Email already registered');
    });

    it('hashes the password, creates the user, assigns the default role, and issues tokens', async () => {
      const { service, usersService, rolesService, passwordService } = buildDeps();
      usersService.findByEmail.mockResolvedValue(null);
      passwordService.hash.mockResolvedValue('argon2-hash');
      usersService.create.mockResolvedValue(buildUser());

      const result = await service.register({
        email: 'believer@example.com',
        password: 'plain-password',
        displayName: 'Believer',
      } as never);

      expect(passwordService.hash).toHaveBeenCalledWith('plain-password');
      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'believer@example.com', passwordHash: 'argon2-hash' }),
      );
      expect(rolesService.assignSystemDefaultRole).toHaveBeenCalledWith('user-1');
      expect(result.access_token).toBe('access-token');
      expect(result.refresh_token).toBe('raw-refresh-token');
      expect(result.user.email).toBe('believer@example.com');
    });
  });

  describe('login', () => {
    it('rejects an unknown email without revealing it does not exist', async () => {
      const { service, usersService } = buildDeps();
      usersService.findByEmail.mockResolvedValue(null);

      await expect(service.login({ email: 'nobody@example.com', password: 'x' } as never)).rejects.toThrow(
        'Invalid credentials',
      );
    });

    it('rejects a wrong password', async () => {
      const { service, usersService, passwordService } = buildDeps();
      usersService.findByEmail.mockResolvedValue(buildUser());
      passwordService.verify.mockResolvedValue(false);

      await expect(service.login({ email: 'believer@example.com', password: 'wrong' } as never)).rejects.toThrow(
        'Invalid credentials',
      );
    });

    it('rejects a non-active account even with the right password', async () => {
      const { service, usersService, passwordService } = buildDeps();
      usersService.findByEmail.mockResolvedValue(buildUser({ status: 'SUSPENDED' }));
      passwordService.verify.mockResolvedValue(true);

      await expect(service.login({ email: 'believer@example.com', password: 'right' } as never)).rejects.toThrow(
        'Account is not active',
      );
    });

    it('issues tokens for a correct, active login', async () => {
      const { service, usersService, passwordService } = buildDeps();
      usersService.findByEmail.mockResolvedValue(buildUser());
      passwordService.verify.mockResolvedValue(true);

      const result = await service.login({ email: 'believer@example.com', password: 'right' } as never);

      expect(result).toMatchObject({ access_token: 'access-token', token_type: 'Bearer' });
    });

    it('returns an MFA challenge instead of tokens when the account has MFA enabled', async () => {
      const { service, usersService, passwordService, tokenService } = buildDeps();
      usersService.findByEmail.mockResolvedValue(buildUser({ mfa_enabled: true }));
      passwordService.verify.mockResolvedValue(true);

      const result = await service.login({ email: 'believer@example.com', password: 'right' } as never);

      expect(result).toEqual({ mfaRequired: true, mfaToken: 'mfa-pending-token' });
      expect(tokenService.createMfaPendingToken).toHaveBeenCalledWith({
        sub: 'user-1',
        email: 'believer@example.com',
      });
    });
  });

  describe('mfaChallenge', () => {
    it('rejects an invalid or expired mfaToken', async () => {
      const { service, tokenService } = buildDeps();
      tokenService.verifyMfaPendingToken.mockReturnValue(null);

      await expect(service.mfaChallenge('bad-token', '123456')).rejects.toThrow(
        'Invalid or expired MFA challenge',
      );
    });

    it('rejects a wrong TOTP code without issuing tokens', async () => {
      const { service, tokenService, usersService, mfaService } = buildDeps();
      tokenService.verifyMfaPendingToken.mockReturnValue('user-1');
      usersService.findById.mockResolvedValue(buildUser({ mfa_enabled: true }));
      usersService.getMfaSecret.mockResolvedValue('SECRET');
      mfaService.verify.mockReturnValue(false);

      await expect(service.mfaChallenge('mfa-pending-token', '000000')).rejects.toThrow('Invalid MFA code');
    });

    it('issues real tokens once the TOTP code checks out', async () => {
      const { service, tokenService, usersService, mfaService } = buildDeps();
      tokenService.verifyMfaPendingToken.mockReturnValue('user-1');
      usersService.findById.mockResolvedValue(buildUser({ mfa_enabled: true }));
      usersService.getMfaSecret.mockResolvedValue('SECRET');
      mfaService.verify.mockReturnValue(true);

      const result = await service.mfaChallenge('mfa-pending-token', '123456');

      expect(mfaService.verify).toHaveBeenCalledWith('123456', 'SECRET');
      expect(result.access_token).toBe('access-token');
    });
  });

  describe('setupMfa', () => {
    it('generates and stores a new secret without enabling MFA yet', async () => {
      const { service, usersService, mfaService } = buildDeps();
      usersService.findById.mockResolvedValue(buildUser());
      mfaService.generateSecret.mockReturnValue('NEWSECRET');
      mfaService.keyUri.mockReturnValue('otpauth://totp/TAG:believer@example.com?secret=NEWSECRET');

      const result = await service.setupMfa('user-1');

      expect(usersService.setMfaSecret).toHaveBeenCalledWith('user-1', 'NEWSECRET');
      expect(usersService.setMfaEnabled).not.toHaveBeenCalled();
      expect(result).toEqual({
        secret: 'NEWSECRET',
        otpauthUrl: 'otpauth://totp/TAG:believer@example.com?secret=NEWSECRET',
      });
    });
  });

  describe('enableMfa', () => {
    it('requires setupMfa to have run first', async () => {
      const { service, usersService } = buildDeps();
      usersService.getMfaSecret.mockResolvedValue(null);

      await expect(service.enableMfa('user-1', '123456')).rejects.toThrow('Call POST /auth/mfa/setup first');
    });

    it('rejects an incorrect confirmation code', async () => {
      const { service, usersService, mfaService } = buildDeps();
      usersService.getMfaSecret.mockResolvedValue('SECRET');
      mfaService.verify.mockReturnValue(false);

      await expect(service.enableMfa('user-1', '000000')).rejects.toThrow('Invalid code');
      expect(usersService.setMfaEnabled).not.toHaveBeenCalled();
    });

    it('turns MFA on once the confirmation code is correct', async () => {
      const { service, usersService, mfaService } = buildDeps();
      usersService.getMfaSecret.mockResolvedValue('SECRET');
      mfaService.verify.mockReturnValue(true);

      await service.enableMfa('user-1', '123456');

      expect(usersService.setMfaEnabled).toHaveBeenCalledWith('user-1', true);
    });
  });

  describe('disableMfa', () => {
    it('rejects an incorrect code and leaves MFA enabled', async () => {
      const { service, usersService, mfaService } = buildDeps();
      usersService.getMfaSecret.mockResolvedValue('SECRET');
      mfaService.verify.mockReturnValue(false);

      await expect(service.disableMfa('user-1', '000000')).rejects.toThrow('Invalid code');
      expect(usersService.setMfaEnabled).not.toHaveBeenCalled();
    });

    it('turns MFA off once the code is correct', async () => {
      const { service, usersService, mfaService } = buildDeps();
      usersService.getMfaSecret.mockResolvedValue('SECRET');
      mfaService.verify.mockReturnValue(true);

      await service.disableMfa('user-1', '123456');

      expect(usersService.setMfaEnabled).toHaveBeenCalledWith('user-1', false);
    });
  });

  describe('refresh', () => {
    it('rejects an unknown refresh token', async () => {
      const supabase = createSupabaseServiceMock({
        refresh_tokens: createQueryChain({ data: null, error: null }),
      });
      const { service } = buildDeps({ supabase });

      await expect(service.refresh({ refreshToken: 'nope' } as never)).rejects.toThrow(
        'Invalid refresh token',
      );
    });

    it('detects reuse of a rotated token and revokes the whole session family', async () => {
      const revokedRow = {
        id: 'rt-1',
        user_id: 'user-1',
        expires_at: '2099-01-01T00:00:00.000Z',
        revoked_at: '2026-01-05T00:00:00.000Z',
      };
      const revokeChain = createQueryChain({ data: null, error: null });
      const supabase = createSupabaseServiceMock({
        refresh_tokens: [createQueryChain({ data: revokedRow, error: null }), revokeChain],
      });
      const { service } = buildDeps({ supabase });

      await expect(service.refresh({ refreshToken: 'stolen' } as never)).rejects.toThrow(
        'Refresh token has been revoked',
      );
      expect(revokeChain.eq).toHaveBeenCalledWith('user_id', 'user-1');
    });

    it('rejects an expired refresh token', async () => {
      const expiredRow = {
        id: 'rt-1',
        user_id: 'user-1',
        expires_at: '2020-01-01T00:00:00.000Z',
        revoked_at: null,
      };
      const supabase = createSupabaseServiceMock({
        refresh_tokens: createQueryChain({ data: expiredRow, error: null }),
      });
      const { service } = buildDeps({ supabase });

      await expect(service.refresh({ refreshToken: 'old' } as never)).rejects.toThrow(
        'Refresh token expired',
      );
    });

    it('rotates a valid token and issues a fresh pair', async () => {
      const validRow = {
        id: 'rt-1',
        user_id: 'user-1',
        expires_at: '2099-01-01T00:00:00.000Z',
        revoked_at: null,
      };
      const rotateChain = createQueryChain({ data: null, error: null });
      const insertChain = createQueryChain({ data: null, error: null });
      const supabase = createSupabaseServiceMock({
        refresh_tokens: [createQueryChain({ data: validRow, error: null }), rotateChain, insertChain],
      });
      const { service, usersService } = buildDeps({ supabase });
      usersService.findById.mockResolvedValue(buildUser());

      const result = await service.refresh({ refreshToken: 'valid' } as never);

      expect(rotateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({ replaced_by_token_hash: 'hashed-refresh-token' }),
      );
      expect(result.refresh_token).toBe('raw-refresh-token');
    });
  });

  describe('forgotPassword', () => {
    it('does nothing observable for an unknown email (no user enumeration)', async () => {
      const { service, usersService, emailService } = buildDeps();
      usersService.findByEmail.mockResolvedValue(null);

      await service.forgotPassword({ email: 'nobody@example.com' } as never);

      expect(emailService.send).not.toHaveBeenCalled();
    });

    it('sends a reset email for a known, active user', async () => {
      const { service, usersService, emailService } = buildDeps();
      usersService.findByEmail.mockResolvedValue(buildUser());

      await service.forgotPassword({ email: 'believer@example.com' } as never);

      expect(emailService.send).toHaveBeenCalledWith(
        'believer@example.com',
        expect.any(String),
        expect.stringContaining('raw-refresh-token'),
        'user-1',
      );
    });
  });

  describe('resetPassword', () => {
    it('rejects an unknown token', async () => {
      const supabase = createSupabaseServiceMock({
        password_reset_tokens: createQueryChain({ data: null, error: null }),
      });
      const { service } = buildDeps({ supabase });

      await expect(service.resetPassword({ token: 'nope', newPassword: 'x' } as never)).rejects.toThrow(
        'Invalid or expired token',
      );
    });

    it('rejects an already-used token', async () => {
      const supabase = createSupabaseServiceMock({
        password_reset_tokens: createQueryChain({
          data: { id: 'prt-1', user_id: 'user-1', expires_at: '2099-01-01T00:00:00.000Z', used_at: '2026-01-01T00:00:00.000Z' },
          error: null,
        }),
      });
      const { service } = buildDeps({ supabase });

      await expect(service.resetPassword({ token: 'used', newPassword: 'x' } as never)).rejects.toThrow(
        'Invalid or expired token',
      );
    });

    it('updates the password and revokes every existing session on success', async () => {
      const markUsedChain = createQueryChain({ data: null, error: null });
      const revokeChain = createQueryChain({ data: null, error: null });
      const supabase = createSupabaseServiceMock({
        password_reset_tokens: [
          createQueryChain({
            data: { id: 'prt-1', user_id: 'user-1', expires_at: '2099-01-01T00:00:00.000Z', used_at: null },
            error: null,
          }),
          markUsedChain,
        ],
        refresh_tokens: revokeChain,
      });
      const { service, usersService, passwordService } = buildDeps({ supabase });
      passwordService.hash.mockResolvedValue('new-hash');

      await service.resetPassword({ token: 'valid', newPassword: 'new-plain' } as never);

      expect(usersService.updatePasswordHash).toHaveBeenCalledWith('user-1', 'new-hash');
      expect(markUsedChain.update).toHaveBeenCalledWith(expect.objectContaining({ used_at: expect.any(String) }));
      expect(revokeChain.update).toHaveBeenCalledWith(expect.objectContaining({ revoked_at: expect.any(String) }));
    });
  });
});
