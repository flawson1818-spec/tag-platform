export interface PrayerReminder {
  id: string;
  user_id: string;
  time_of_day: string;
  days_of_week: number[];
  timezone: string;
  enabled: boolean;
  last_fired_at: string | null;
  created_at: string;
  updated_at: string;
}
