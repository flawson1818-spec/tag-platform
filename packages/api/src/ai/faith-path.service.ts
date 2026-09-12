import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { FAITH_PATH_STEPS, FaithPathLevel, FaithPathProgress, FaithPathStep } from './faith-path.entity';

const PROGRESS_COLUMNS = 'current_step, declared_level, updated_at';

function defaultProgress(): FaithPathProgress {
  return { current_step: FAITH_PATH_STEPS[0], declared_level: null, updated_at: new Date(0).toISOString() };
}

@Injectable()
export class FaithPathService {
  constructor(private readonly supabase: SupabaseService) {}

  private get db() {
    return this.supabase.client.from('faith_path_progress');
  }

  /** Never throws for "no progress yet" — returns the step-0/no-level default instead. */
  async get(userId: string): Promise<FaithPathProgress> {
    const { data, error } = await this.db.select(PROGRESS_COLUMNS).eq('user_id', userId).maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    return (data as FaithPathProgress | null) ?? defaultProgress();
  }

  async setLevel(userId: string, level: FaithPathLevel): Promise<FaithPathProgress> {
    const current = await this.get(userId);
    const { error } = await this.db.upsert(
      { user_id: userId, current_step: current.current_step, declared_level: level, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
    if (error) throw new InternalServerErrorException(error.message);
    return { ...current, declared_level: level };
  }

  /** Moves to the next step, capped at the last one — never wraps or errors past the end. */
  async advance(userId: string): Promise<FaithPathProgress> {
    const current = await this.get(userId);
    const currentIndex = FAITH_PATH_STEPS.indexOf(current.current_step);
    const nextStep: FaithPathStep = FAITH_PATH_STEPS[Math.min(currentIndex + 1, FAITH_PATH_STEPS.length - 1)];

    const { error } = await this.db.upsert(
      { user_id: userId, current_step: nextStep, declared_level: current.declared_level, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
    if (error) throw new InternalServerErrorException(error.message);
    return { ...current, current_step: nextStep };
  }
}
