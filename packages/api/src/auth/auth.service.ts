import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { MfaRecoveryCodesService } from '../access/mfa-recovery-codes.service';
import { MfaService } from '../access/mfa.service';
import { PasswordService } from '../access/password.service';
import { TokenService } from '../access/token.service';
import { SupabaseService } from '../supabase/supabase.service';
import { EmailService } from '../communication/email.service';
import { RolesService } from '../roles/roles.service';
import { toUserResponse } from '../users/user-response.dto';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { AuthResponseDto } from './dto/auth-response.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { MfaRequiredResponseDto } from './dto/mfa-required-response.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const EMAIL_VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly rolesService: RolesService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly emailService: EmailService,
    private readonly mfaService: MfaService,
    private readonly mfaRecoveryCodesService: MfaRecoveryCodesService,
    private readonly supabase: SupabaseService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await this.passwordService.hash(dto.password);
    const user = await this.usersService.create({
      email: dto.email,
      passwordHash,
      displayName: dto.displayName,
      phone: dto.phone,
      locale: dto.locale,
      timezone: dto.timezone,
    });
    await this.rolesService.assignSystemDefaultRole(user.id);
    await this.sendVerificationEmail(user);

    return this.issueTokens(user);
  }

  /**
   * Non-blocking by design (docs/07_UX_UI_SPECIFICATION.md section 2: "Inscription → vérification
   * email → onboarding..."): login/registration never gate on this — a real user with no working
   * email provider configured would otherwise be locked out entirely. The frontend onboarding flow
   * simply nudges the user to verify.
   */
  private async sendVerificationEmail(user: User): Promise<void> {
    const raw = this.tokenService.createRefreshTokenPair().token;
    const hash = this.tokenService.hashToken(raw);
    const { error } = await this.supabase.client.from('email_verification_tokens').insert({
      user_id: user.id,
      token_hash: hash,
      expires_at: new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_TTL_MS).toISOString(),
    });
    if (error) throw new InternalServerErrorException(error.message);
    await this.emailService.send(
      user.email,
      'Vérifie ton adresse e-mail TAG',
      `Voici ton code de vérification : ${raw} (valable 24 heures).`,
      user.id,
    );
  }

  async resendVerificationEmail(userId: string): Promise<void> {
    const user = await this.usersService.findById(userId);
    await this.sendVerificationEmail(user);
  }

  async verifyEmail(token: string): Promise<void> {
    const hash = this.tokenService.hashToken(token);
    const { data: row, error } = await this.supabase.client
      .from('email_verification_tokens')
      .select('id, user_id, expires_at, used_at')
      .eq('token_hash', hash)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!row || row.used_at || new Date(row.expires_at) < new Date()) {
      throw new BadRequestException('Invalid or expired token');
    }

    const { error: userError } = await this.supabase.client
      .from('users')
      .update({ email_verified_at: new Date().toISOString() })
      .eq('id', row.user_id);
    if (userError) throw new InternalServerErrorException(userError.message);

    const { error: markUsedError } = await this.supabase.client
      .from('email_verification_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('id', row.id);
    if (markUsedError) throw new InternalServerErrorException(markUsedError.message);
  }

  async login(dto: LoginDto): Promise<AuthResponseDto | MfaRequiredResponseDto> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const validPassword = await this.passwordService.verify(user.password_hash, dto.password);
    if (!validPassword) throw new UnauthorizedException('Invalid credentials');
    if (user.status !== 'ACTIVE') throw new UnauthorizedException('Account is not active');

    if (user.mfa_enabled) {
      return {
        mfaRequired: true,
        mfaToken: this.tokenService.createMfaPendingToken({ sub: user.id, email: user.email }),
      };
    }

    return this.issueTokens(user);
  }

  /** Completes a login that returned mfaRequired, by exchanging the pending token + TOTP code
   *  for a real session — the only path that can issue tokens for an MFA-enabled account. */
  async mfaChallenge(mfaToken: string, code: string): Promise<AuthResponseDto> {
    const userId = this.tokenService.verifyMfaPendingToken(mfaToken);
    if (!userId) throw new UnauthorizedException('Invalid or expired MFA challenge');

    const user = await this.usersService.findById(userId).catch(() => null);
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('Invalid or expired MFA challenge');

    const secret = await this.usersService.getMfaSecret(userId);
    if (!secret || !this.mfaService.verify(code, secret)) {
      throw new UnauthorizedException('Invalid MFA code');
    }

    return this.issueTokens(user);
  }

  /**
   * docs/12_SECURITY_SPECIFICATION.md MFA section — "Recovery Codes", the standard fallback for
   * a lost authenticator device. Same pending-token flow as mfaChallenge(), but consumes a
   * single-use recovery code instead of a TOTP code.
   */
  async mfaRecoveryChallenge(mfaToken: string, recoveryCode: string): Promise<AuthResponseDto> {
    const userId = this.tokenService.verifyMfaPendingToken(mfaToken);
    if (!userId) throw new UnauthorizedException('Invalid or expired MFA challenge');

    const user = await this.usersService.findById(userId).catch(() => null);
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('Invalid or expired MFA challenge');

    const consumed = await this.mfaRecoveryCodesService.consume(userId, recoveryCode);
    if (!consumed) throw new UnauthorizedException('Invalid or already-used recovery code');

    return this.issueTokens(user);
  }

  /** Step 1 of enabling MFA: generates and stores a secret (not yet active — mfa_enabled stays
   *  false until enableMfa() confirms the user can actually generate valid codes with it). */
  async setupMfa(userId: string): Promise<{ secret: string; otpauthUrl: string }> {
    const user = await this.usersService.findById(userId);
    const secret = this.mfaService.generateSecret();
    await this.usersService.setMfaSecret(userId, secret);
    return { secret, otpauthUrl: this.mfaService.keyUri(user.email, secret) };
  }

  /**
   * Step 2: proves the user's authenticator app is correctly configured before it becomes the
   * account's real second factor. Also (re-)generates recovery codes — shown to the caller in
   * plaintext exactly once here, never retrievable again (docs/12_SECURITY_SPECIFICATION.md).
   * MFA itself is already fully turned on by the time recovery-code generation runs, and this
   * capability is strictly additive to a flow that worked before it existed — a failure here
   * (e.g. the mfa_recovery_codes table not migrated yet on this environment) must never undo
   * that or block the caller, just come back with no codes.
   */
  async enableMfa(userId: string, code: string): Promise<{ recoveryCodes: string[] }> {
    const secret = await this.usersService.getMfaSecret(userId);
    if (!secret) throw new BadRequestException('Call POST /auth/mfa/setup first');
    if (!this.mfaService.verify(code, secret)) throw new BadRequestException('Invalid code');

    await this.usersService.setMfaEnabled(userId, true);

    const recoveryCodes = await this.mfaRecoveryCodesService
      .generate(userId)
      .catch((error) => {
        this.logger.error(`Failed to generate MFA recovery codes for user ${userId}`, error as Error);
        return [] as string[];
      });
    return { recoveryCodes };
  }

  async disableMfa(userId: string, code: string): Promise<void> {
    const secret = await this.usersService.getMfaSecret(userId);
    if (!secret || !this.mfaService.verify(code, secret)) {
      throw new BadRequestException('Invalid code');
    }

    await this.usersService.setMfaEnabled(userId, false);
    await this.mfaRecoveryCodesService
      .deleteAll(userId)
      .catch((error) => this.logger.error(`Failed to delete MFA recovery codes for user ${userId}`, error as Error));
  }

  async refresh(dto: RefreshTokenDto): Promise<AuthResponseDto> {
    const hash = this.tokenService.hashToken(dto.refreshToken);
    const { data: row, error } = await this.supabase.client
      .from('refresh_tokens')
      .select('id, user_id, expires_at, revoked_at')
      .eq('token_hash', hash)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!row) throw new UnauthorizedException('Invalid refresh token');

    if (row.revoked_at) {
      // Reuse of an already-rotated token indicates a stolen token: revoke the whole session family.
      await this.revokeAllRefreshTokensForUser(row.user_id);
      throw new UnauthorizedException('Refresh token has been revoked');
    }
    if (new Date(row.expires_at) < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const user = await this.usersService.findById(row.user_id).catch(() => null);
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('Invalid refresh token');

    const next = this.tokenService.createRefreshTokenPair();
    const { error: rotateError } = await this.supabase.client
      .from('refresh_tokens')
      .update({ revoked_at: new Date().toISOString(), replaced_by_token_hash: next.hash })
      .eq('id', row.id);
    if (rotateError) throw new InternalServerErrorException(rotateError.message);

    await this.storeRefreshToken(user.id, next);

    return {
      access_token: this.tokenService.createAccessToken({ sub: user.id, email: user.email }),
      refresh_token: next.token,
      expires_in: this.tokenService.accessTokenExpiresInSeconds,
      token_type: 'Bearer',
      user: toUserResponse(user),
    };
  }

  async logout(dto: RefreshTokenDto): Promise<void> {
    const hash = this.tokenService.hashToken(dto.refreshToken);
    const { error } = await this.supabase.client
      .from('refresh_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('token_hash', hash)
      .is('revoked_at', null);
    if (error) throw new InternalServerErrorException(error.message);
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const user = await this.usersService.findByEmail(dto.email);
    if (user && user.status === 'ACTIVE') {
      const raw = this.tokenService.createRefreshTokenPair().token;
      const hash = this.tokenService.hashToken(raw);
      const { error } = await this.supabase.client.from('password_reset_tokens').insert({
        user_id: user.id,
        token_hash: hash,
        expires_at: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS).toISOString(),
      });
      if (error) throw new InternalServerErrorException(error.message);
      await this.emailService.send(
        user.email,
        'Réinitialisation de votre mot de passe TAG',
        `Voici votre code de réinitialisation : ${raw} (valable 1 heure).`,
        user.id,
      );
    }
    // Always resolve the same way regardless of whether the email exists.
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const hash = this.tokenService.hashToken(dto.token);
    const { data: row, error } = await this.supabase.client
      .from('password_reset_tokens')
      .select('id, user_id, expires_at, used_at')
      .eq('token_hash', hash)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!row || row.used_at || new Date(row.expires_at) < new Date()) {
      throw new BadRequestException('Invalid or expired token');
    }

    const passwordHash = await this.passwordService.hash(dto.newPassword);
    await this.usersService.updatePasswordHash(row.user_id, passwordHash);

    const { error: markUsedError } = await this.supabase.client
      .from('password_reset_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('id', row.id);
    if (markUsedError) throw new InternalServerErrorException(markUsedError.message);

    await this.revokeAllRefreshTokensForUser(row.user_id);
  }

  private async issueTokens(user: User): Promise<AuthResponseDto> {
    const refreshTokenPair = this.tokenService.createRefreshTokenPair();
    await this.storeRefreshToken(user.id, refreshTokenPair);

    return {
      access_token: this.tokenService.createAccessToken({ sub: user.id, email: user.email }),
      refresh_token: refreshTokenPair.token,
      expires_in: this.tokenService.accessTokenExpiresInSeconds,
      token_type: 'Bearer',
      user: toUserResponse(user),
    };
  }

  private async storeRefreshToken(
    userId: string,
    pair: { hash: string; expiresAt: Date },
  ): Promise<void> {
    const { error } = await this.supabase.client.from('refresh_tokens').insert({
      user_id: userId,
      token_hash: pair.hash,
      expires_at: pair.expiresAt.toISOString(),
    });
    if (error) throw new InternalServerErrorException(error.message);
  }

  private async revokeAllRefreshTokensForUser(userId: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('refresh_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('revoked_at', null);
    if (error) throw new InternalServerErrorException(error.message);
  }
}
