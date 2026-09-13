import { randomInt } from 'node:crypto';
import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { PasswordService } from '../access/password.service';
import { EmailService } from '../communication/email.service';
import { WhatsAppService } from '../communication/whatsapp.service';
import { SupabaseService } from '../supabase/supabase.service';
import { User } from '../users/user.entity';

export const MFA_OTP_CHANNELS = ['EMAIL', 'WHATSAPP'] as const;
export type MfaOtpChannel = (typeof MFA_OTP_CHANNELS)[number];

const OTP_TTL_MINUTES = 10;

interface OtpChallengeRow {
  id: string;
  code_hash: string;
}

/**
 * docs/12_SECURITY_SPECIFICATION.md MFA section: "Email OTP" / "SMS OTP" / "WhatsApp OTP" — only
 * TOTP existed. SMS is deliberately not covered here (no SMS service/provider exists anywhere in
 * this codebase, unlike Email/WhatsApp which already have a — currently log-only — send path);
 * see docs/09_ROADMAP_AND_BACKLOG.md's single-provider-dependency note. Same one-time-code
 * discipline as recovery codes: argon2id-hashed, single-use, and — since a 6-digit code is far
 * lower entropy than a recovery code — short-lived (10 minutes) on top of that.
 */
@Injectable()
export class MfaOtpService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly passwordService: PasswordService,
    private readonly emailService: EmailService,
    private readonly whatsAppService: WhatsAppService,
  ) {}

  private get db() {
    return this.supabase.client.from('mfa_otp_challenges');
  }

  /** Generates and delivers a fresh code, invalidating any still-pending one for this user first. */
  async request(user: User, channel: MfaOtpChannel): Promise<void> {
    if (channel === 'WHATSAPP' && !user.phone) {
      throw new BadRequestException('No phone number on file for WhatsApp OTP');
    }

    const code = this.randomCode();
    const codeHash = await this.passwordService.hash(code);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000).toISOString();

    const { error: deleteError } = await this.db.delete().eq('user_id', user.id).is('used_at', null);
    if (deleteError) throw new InternalServerErrorException(deleteError.message);

    const { error } = await this.db.insert({ user_id: user.id, channel, code_hash: codeHash, expires_at: expiresAt });
    if (error) throw new InternalServerErrorException(error.message);

    const body = `Ton code de vérification TAG : ${code} (valable ${OTP_TTL_MINUTES} minutes).`;
    if (channel === 'EMAIL') {
      await this.emailService.send(user.email, 'Ton code de vérification TAG', body, user.id);
    } else {
      await this.whatsAppService.send(user.phone as string, body, user.id);
    }
  }

  /** Verifies against any unused, unexpired challenge for this user — regardless of which channel it went out on. */
  async verify(userId: string, code: string): Promise<boolean> {
    const { data, error } = await this.db
      .select('id, code_hash')
      .eq('user_id', userId)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString());
    if (error) throw new InternalServerErrorException(error.message);

    for (const row of (data ?? []) as unknown as OtpChallengeRow[]) {
      if (await this.passwordService.verify(row.code_hash, code)) {
        const { error: updateError } = await this.db.update({ used_at: new Date().toISOString() }).eq('id', row.id);
        if (updateError) throw new InternalServerErrorException(updateError.message);
        return true;
      }
    }
    return false;
  }

  private randomCode(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }
}
