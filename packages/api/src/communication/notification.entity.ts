export type NotificationStatus = 'CREATED' | 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'ARCHIVED';

/** Every trigger type NotificationsService.create() is actually called with. Keep in sync. */
export const NOTIFICATION_TYPES = [
  'TESTIMONY_PUBLISHED',
  'TESTIMONY_REJECTED',
  'PRAYER_REQUEST_ANSWERED',
  'PRAYER_REMINDER',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface NotificationPreference {
  type: NotificationType;
  enabled: boolean;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  payload: Record<string, unknown>;
  status: NotificationStatus;
  read_at: string | null;
  created_at: string;
}
