export interface TrustedDevice {
  id: string;
  label: string | null;
  last_used_at: string | null;
  expires_at: string;
  created_at: string;
}
