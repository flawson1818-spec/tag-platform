export type PrayerProgramStatus = 'DRAFT' | 'PLANNED' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED';

export interface PrayerProgram {
  id: string;
  community_id: string | null;
  title: string;
  recurrence_rule: string | null;
  status: PrayerProgramStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
