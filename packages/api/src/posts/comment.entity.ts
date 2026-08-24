export type CommentStatus = 'CREATED' | 'EDITED' | 'DELETED';

export interface Comment {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  status: CommentStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
