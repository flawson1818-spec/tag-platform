export type BackupStatus = 'CREATED' | 'RUNNING' | 'COMPLETED' | 'VERIFIED' | 'ARCHIVED';

export interface Backup {
  id: string;
  status: BackupStatus;
  note: string | null;
  requested_by: string | null;
  created_at: string;
  updated_at: string;
}
