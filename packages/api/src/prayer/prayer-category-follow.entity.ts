import { PrayerCategory } from './prayer-constants';

export interface PrayerCategoryFollow {
  id: string;
  user_id: string;
  category: PrayerCategory;
  created_at: string;
}
