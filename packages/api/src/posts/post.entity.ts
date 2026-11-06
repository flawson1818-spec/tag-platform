export type PostStatus = 'DRAFT' | 'PUBLISHED' | 'EDITED' | 'ARCHIVED';

export interface Post {
  id: string;
  /** Null for a personal post (migration 20261107): visible in the feed, on its author's profile. */
  community_id: string | null;
  author_id: string;
  content: string;
  status: PostStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
