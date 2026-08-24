export type UserStatus = 'ACTIVE' | 'LOCKED' | 'SUSPENDED' | 'DELETED';

export interface User {
  id: string;
  email: string;
  phone: string | null;
  password_hash: string;
  display_name: string;
  avatar_file_id: string | null;
  locale: string;
  timezone: string;
  status: UserStatus;
  mfa_enabled: boolean;
  email_verified_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
