export type NotificationStatus = 'CREATED' | 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'ARCHIVED';

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  payload: Record<string, unknown>;
  status: NotificationStatus;
  read_at: string | null;
  created_at: string;
}
