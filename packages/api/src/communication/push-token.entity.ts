export type PushPlatform = 'IOS' | 'ANDROID' | 'WEB' | 'UNKNOWN';

export interface PushToken {
  id: string;
  user_id: string;
  token: string;
  platform: PushPlatform;
  created_at: string;
}

export type PushNotificationStatus = 'CREATED' | 'QUEUED' | 'SENDING' | 'DELIVERED' | 'FAILED';

export interface PushNotification {
  id: string;
  user_id: string;
  push_token_id: string | null;
  title: string;
  body: string;
  status: PushNotificationStatus;
  sent_at: string | null;
  created_at: string;
}
