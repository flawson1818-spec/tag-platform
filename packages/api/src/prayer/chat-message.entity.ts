export type ChatMessageStatus = 'VISIBLE' | 'HIDDEN';

export interface ChatMessage {
  id: string;
  community_id: string | null;
  author_id: string;
  author_display_name: string | null;
  content: string;
  status: ChatMessageStatus;
  created_at: string;
}
