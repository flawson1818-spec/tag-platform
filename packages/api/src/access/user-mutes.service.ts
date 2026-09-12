import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

interface MuteRow {
  muted_until: string;
}

/**
 * docs/02_AI_AGENTS_SPECIFICATION.md §5 (IA Modératrice) / docs/06_RBAC_SPECIFICATION.md §5
 * ("room.moderate": mute, avertissement — human; "user.mute_temporary" — IA Modératrice under a
 * configured threshold). Always reversible, never exclusion (docs/09_ROADMAP_AND_BACKLOG.md §4).
 * A mute is scoped the same way a chat room is — null communityId is the world room.
 */
@Injectable()
export class UserMutesService {
  constructor(private readonly supabase: SupabaseService) {}

  private get db() {
    return this.supabase.client.from('user_mutes');
  }

  async activeMuteUntil(userId: string, communityId: string | null): Promise<string | null> {
    let query = this.db
      .select('muted_until')
      .eq('user_id', userId)
      .gt('muted_until', new Date().toISOString())
      .order('muted_until', { ascending: false })
      .limit(1);
    query = communityId ? query.eq('community_id', communityId) : query.is('community_id', null);

    const { data, error } = await query.maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    return (data as MuteRow | null)?.muted_until ?? null;
  }

  async mute(
    userId: string,
    communityId: string | null,
    minutes: number,
    mutedBy: string | null,
    reason: string | null,
  ): Promise<string> {
    const mutedUntil = new Date(Date.now() + minutes * 60_000).toISOString();
    const { error } = await this.db.insert({
      user_id: userId,
      community_id: communityId,
      muted_until: mutedUntil,
      muted_by: mutedBy,
      reason,
    });
    if (error) throw new InternalServerErrorException(error.message);
    return mutedUntil;
  }

  async unmute(userId: string, communityId: string | null): Promise<void> {
    let query = this.db.delete().eq('user_id', userId).gt('muted_until', new Date().toISOString());
    query = communityId ? query.eq('community_id', communityId) : query.is('community_id', null);

    const { error } = await query;
    if (error) throw new InternalServerErrorException(error.message);
  }
}
