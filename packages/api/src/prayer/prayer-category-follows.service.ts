import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { PrayerCategoryFollow } from './prayer-category-follow.entity';

const FOLLOW_COLUMNS = 'id, user_id, category, created_at';

/**
 * docs/01_FUNCTIONAL_SPECIFICATION.md §11 notification triggers: "Début d'un sujet suivi/favori".
 * A brand-new, isolated table only touched by this service and PrayerTopicNotificationSchedulerService.
 * Follows a category (Famille, Santé, ...), not an individual slot — slots are one-off and
 * ephemeral, while a category is what a user would plausibly want to keep hearing about.
 */
@Injectable()
export class PrayerCategoryFollowsService {
  constructor(private readonly supabase: SupabaseService) {}

  private get db() {
    return this.supabase.client.from('prayer_category_follows');
  }

  async follow(userId: string, category: string): Promise<PrayerCategoryFollow> {
    const { data, error } = await this.db
      .upsert({ user_id: userId, category }, { onConflict: 'user_id,category', ignoreDuplicates: true })
      .select(FOLLOW_COLUMNS)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (data) return data as unknown as PrayerCategoryFollow;

    const { data: existing, error: fetchError } = await this.db
      .select(FOLLOW_COLUMNS)
      .eq('user_id', userId)
      .eq('category', category)
      .single();
    if (fetchError) throw new InternalServerErrorException(fetchError.message);
    return existing as unknown as PrayerCategoryFollow;
  }

  async unfollow(userId: string, category: string): Promise<void> {
    const { error } = await this.db.delete().eq('user_id', userId).eq('category', category);
    if (error) throw new InternalServerErrorException(error.message);
  }

  async listForUser(userId: string): Promise<PrayerCategoryFollow[]> {
    const { data, error } = await this.db.select(FOLLOW_COLUMNS).eq('user_id', userId).order('category');
    if (error) throw new InternalServerErrorException(error.message);
    return data as unknown as PrayerCategoryFollow[];
  }

  async listFollowerIds(category: string): Promise<string[]> {
    const { data, error } = await this.db.select('user_id').eq('category', category);
    if (error) throw new InternalServerErrorException(error.message);
    return (data as unknown as { user_id: string }[]).map((row) => row.user_id);
  }
}
