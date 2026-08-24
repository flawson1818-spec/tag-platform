export type PostStatus = 'DRAFT' | 'PUBLISHED' | 'EDITED' | 'ARCHIVED';

export interface Post {
  id: string;
  community_id: string;
  author_id: string;
  content: string;
  status: PostStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
