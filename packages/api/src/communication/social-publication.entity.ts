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

/** docs/02_AI_AGENTS_SPECIFICATION.md section 6 — per-channel "auto-publish" toggle. */
export interface SocialPublicationChannelSetting {
  channel: SocialChannel;
  auto_publish: boolean;
  updated_by: string | null;
  updated_at: string;
}
