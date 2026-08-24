export type EmailStatus = 'CREATED' | 'QUEUED' | 'SENDING' | 'SENT' | 'DELIVERED' | 'FAILED';

export interface Email {
  id: string;
  user_id: string | null;
  to_email: string;
  subject: string;
  body: string;
  status: EmailStatus;
  sent_at: string | null;
  created_at: string;
}
