import { PrayerCategory, PrayerImportance } from './prayer-constants';

export type PrayerSlotStatus = 'CREATED' | 'SCHEDULED' | 'OPEN' | 'RUNNING' | 'FINISHED' | 'ARCHIVED';

export interface PrayerSlot {
  id: string;
  program_id: string;
  order_index: number;
  title: string;
  category: PrayerCategory;
  importance: PrayerImportance;
  start_at: string;
  end_at: string;
  guided_text: string | null;
  bible_references: string[];
  recommended_songs: string[];
  leader_user_id: string | null;
  leader_display_name: string | null;
  status: PrayerSlotStatus;
  created_at: string;
  updated_at: string;
}
