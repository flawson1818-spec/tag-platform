import { randomBytes } from 'node:crypto';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { TokenService } from './token.service';
import { TrustedDevice } from './trusted-device.entity';

const DEVICE_COLUMNS = 'id, label, last_used_at, expires_at, created_at';
const DEFAULT_TRUST_DAYS = 30;

/**
 * docs/12_SECURITY_SPECIFICATION.md MFA section — "Trusted Devices": lets a user skip the MFA
 * challenge on a device they've already proven ownership of. The plaintext token is only ever
 * returned once, at trust() time — same one-time-reveal discipline as recovery codes, but hashed
 * with the fast TokenService.hashToken() (a direct-lookup pattern already used for
 * refresh/reset/verification tokens) since this is checked on every login, not a handful of times.
 */
@Injectable()
export class TrustedDevicesService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly tokenService: TokenService,
  ) {}

  private get db() {
    return this.supabase.client.from('trusted_devices');
  }

  async trust(userId: string, label: string | null = null, days = DEFAULT_TRUST_DAYS): Promise<string> {
    const token = randomBytes(32).toString('hex');
    const { error } = await this.db.insert({
      user_id: userId,
      token_hash: this.tokenService.hashToken(token),
      label,
      expires_at: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
    });
    if (error) throw new InternalServerErrorException(error.message);
    return token;
  }

  /** False for a missing/unknown/expired token — never throws for "not trusted", only for a real DB error. */
  async isTrusted(userId: string, token: string): Promise<boolean> {
    const { data, error } = await this.db
      .select('id, expires_at')
      .eq('user_id', userId)
      .eq('token_hash', this.tokenService.hashToken(token))
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);

    const row = data as { id: string; expires_at: string } | null;
    if (!row || new Date(row.expires_at) < new Date()) return false;

    await this.db.update({ last_used_at: new Date().toISOString() }).eq('id', row.id);
    return true;
  }

  async list(userId: string): Promise<TrustedDevice[]> {
    const { data, error } = await this.db
      .select(DEVICE_COLUMNS)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw new InternalServerErrorException(error.message);
    return data as unknown as TrustedDevice[];
  }

  async revoke(userId: string, deviceId: string): Promise<void> {
    const { error } = await this.db.delete().eq('id', deviceId).eq('user_id', userId);
    if (error) throw new InternalServerErrorException(error.message);
  }

  /** Called when MFA is disabled — a remembered-device bypass is meaningless once MFA is off. */
  async revokeAll(userId: string): Promise<void> {
    const { error } = await this.db.delete().eq('user_id', userId);
    if (error) throw new InternalServerErrorException(error.message);
  }
}
