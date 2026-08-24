import { Confidentiality, PrayerRequestCategory } from './prayer-constants';

export type PrayerRequestStatus =
  | 'DRAFT'
  | 'NEW'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'WAITING'
  | 'ANSWERED'
  | 'ARCHIVED'
  | 'RESTORED';

export interface PrayerRequest {
  id: string;
  author_id: string | null;
  category: PrayerRequestCategory;
  description: string;
  photo_file_id: string | null;
  attachment_file_id: string | null;
  confidentiality: Confidentiality;
  status: PrayerRequestStatus;
  promoted_slot_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
