export type TestimonyMediaType = 'TEXT' | 'AUDIO' | 'VIDEO' | 'PHOTO';
export type TestimonyStatus = 'DRAFT' | 'PUBLISHED' | 'EDITED' | 'ARCHIVED';

export interface Testimony {
  id: string;
  author_id: string;
  related_request_id: string | null;
  media_type: TestimonyMediaType;
  content: string | null;
  file_id: string | null;
  status: TestimonyStatus;
  moderated_by: string | null;
  moderation_reason: string | null;
  ai_flagged: boolean;
  ai_flag_reason: string | null;
  ai_flag_confidence: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
