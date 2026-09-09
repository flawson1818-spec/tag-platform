import { randomBytes } from 'node:crypto';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { PasswordService } from './password.service';

const RECOVERY_CODE_COUNT = 10;

interface RecoveryCodeRow {
  id: string;
  code_hash: string;
}

/**
 * docs/12_SECURITY_SPECIFICATION.md (MFA section) — the standard fallback when a user loses
 * their authenticator device. Codes are single-use, hashed the same way as passwords (argon2id
 * via PasswordService — not password-specific in implementation, just a strong generic hash),
 * and only ever returned to the caller in plaintext once, at generation time.
 */
@Injectable()
export class MfaRecoveryCodesService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly passwordService: PasswordService,
  ) {}

  private get db() {
    return this.supabase.client.from('mfa_recovery_codes');
  }

  /** Replaces any existing set for this user — re-enabling MFA invalidates old codes. */
  async generate(userId: string, count = RECOVERY_CODE_COUNT): Promise<string[]> {
    const codes = Array.from({ length: count }, () => this.randomCode());
    const rows = await Promise.all(
      codes.map(async (code) => ({ user_id: userId, code_hash: await this.passwordService.hash(code) })),
    );

    const { error: deleteError } = await this.db.delete().eq('user_id', userId);
    if (deleteError) throw new InternalServerErrorException(deleteError.message);

    const { error } = await this.db.insert(rows);
    if (error) throw new InternalServerErrorException(error.message);

    return codes;
  }

  /** Consumes one matching unused code for this user. Returns whether a match was found. */
  async consume(userId: string, code: string): Promise<boolean> {
    const { data, error } = await this.db.select('id, code_hash').eq('user_id', userId).is('used_at', null);
    if (error) throw new InternalServerErrorException(error.message);

    for (const row of (data ?? []) as unknown as RecoveryCodeRow[]) {
      if (await this.passwordService.verify(row.code_hash, code)) {
        const { error: updateError } = await this.db.update({ used_at: new Date().toISOString() }).eq('id', row.id);
        if (updateError) throw new InternalServerErrorException(updateError.message);
        return true;
      }
    }
    return false;
  }

  /** Called when MFA is disabled — leftover codes are inert but not worth keeping around. */
  async deleteAll(userId: string): Promise<void> {
    const { error } = await this.db.delete().eq('user_id', userId);
    if (error) throw new InternalServerErrorException(error.message);
  }

  private randomCode(): string {
    const raw = randomBytes(6).toString('hex').toUpperCase(); // 12 hex chars
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
  }
}
