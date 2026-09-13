import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { PasswordService } from './password.service';

/** docs/12_SECURITY_SPECIFICATION.md PASSWORD POLICY "Historique" — no exact count given; 5 is a
 *  commonly-used default (matches e.g. NIST SP 800-63B's suggested minimum). */
const HISTORY_SIZE = 5;

/**
 * A brand-new, isolated table only touched by this service. wasRecentlyUsed() checks against
 * the user's CURRENT password too (trivially can't "reuse" what's already active), not just
 * past entries — record() is only ever called with the password being replaced, right before
 * it stops being current.
 */
@Injectable()
export class PasswordHistoryService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly passwordService: PasswordService,
  ) {}

  private get db() {
    return this.supabase.client.from('password_history');
  }

  async wasRecentlyUsed(userId: string, currentPasswordHash: string, candidatePlain: string): Promise<boolean> {
    if (await this.passwordService.verify(currentPasswordHash, candidatePlain)) return true;

    const { data, error } = await this.db
      .select('password_hash')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(HISTORY_SIZE);
    if (error) throw new InternalServerErrorException(error.message);

    for (const row of (data ?? []) as unknown as { password_hash: string }[]) {
      if (await this.passwordService.verify(row.password_hash, candidatePlain)) return true;
    }
    return false;
  }

  /** Call with the hash being replaced, right before overwriting users.password_hash. */
  async record(userId: string, passwordHash: string): Promise<void> {
    const { error } = await this.db.insert({ user_id: userId, password_hash: passwordHash });
    if (error) throw new InternalServerErrorException(error.message);
    await this.prune(userId);
  }

  private async prune(userId: string): Promise<void> {
    const { data, error } = await this.db
      .select('id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw new InternalServerErrorException(error.message);

    const staleIds = (data as unknown as { id: string }[]).slice(HISTORY_SIZE).map((row) => row.id);
    if (staleIds.length === 0) return;

    const { error: deleteError } = await this.db.delete().in('id', staleIds);
    if (deleteError) throw new InternalServerErrorException(deleteError.message);
  }
}
