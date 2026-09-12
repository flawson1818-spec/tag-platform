export interface CommunityAnnouncement {
  id: string;
  community_id: string | null;
  author_id: string;
  content: string;
  pinned_at: string | null;
  created_at: string;
  updated_at: string;
}
