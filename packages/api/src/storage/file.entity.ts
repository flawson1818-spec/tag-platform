export type FileStatus = 'UPLOADING' | 'UPLOADED' | 'SCANNED' | 'AVAILABLE' | 'ARCHIVED' | 'DELETED';

export interface StoredFile {
  id: string;
  owner_id: string;
  bucket_key: string;
  mime_type: string;
  size_bytes: number | null;
  status: FileStatus;
  scan_result: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
