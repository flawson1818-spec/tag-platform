export const SOCIAL_CHANNELS = [
  'Facebook',
  'Instagram',
  'TikTok',
  'YouTube',
  'X',
  'LinkedIn',
  'Threads',
] as const;

export type SocialChannel = (typeof SOCIAL_CHANNELS)[number];
export type SocialPublicationStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'PUBLISHED' | 'REJECTED';

export interface SocialPublication {
  id: string;
  testimony_id: string | null;
  channel: SocialChannel;
  draft_content: string;
  status: SocialPublicationStatus;
  approved_by: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}
