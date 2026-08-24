export type WhatsAppMessageStatus = 'CREATED' | 'QUEUED' | 'SENDING' | 'DELIVERED' | 'READ' | 'FAILED';

export interface WhatsAppMessage {
  id: string;
  user_id: string | null;
  to_phone: string;
  body: string;
  status: WhatsAppMessageStatus;
  sent_at: string | null;
  created_at: string;
}
