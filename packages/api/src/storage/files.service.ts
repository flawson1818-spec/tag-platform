import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { SupabaseService } from '../supabase/supabase.service';
import { PresignFileDto } from './dto/presign-file.dto';
import { StoredFile } from './file.entity';

const FILE_COLUMNS =
  'id, owner_id, bucket_key, mime_type, size_bytes, status, scan_result, created_at, updated_at, deleted_at';
const BUCKET = 'tag-files';

export interface PresignResult {
  file: StoredFile;
  uploadUrl: string;
  token: string;
}

export type FileWithReadUrl = StoredFile & { readUrl?: string };

const READ_URL_TTL_SECONDS = 300;

@Injectable()
export class FilesService {
  constructor(private readonly supabase: SupabaseService) {}

  private get db() {
    return this.supabase.client.from('files');
  }

  private get bucket() {
    return this.supabase.client.storage.from(BUCKET);
  }

  async presign(ownerId: string, dto: PresignFileDto): Promise<PresignResult> {
    const fileId = randomUUID();
    const sanitizedName = dto.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const bucketKey = `${ownerId}/${fileId}-${sanitizedName}`;

    const { data: signed, error: signError } = await this.bucket.createSignedUploadUrl(bucketKey);
    if (signError) throw new InternalServerErrorException(signError.message);

    const { data, error } = await this.db
      .insert({
        id: fileId,
        owner_id: ownerId,
        bucket_key: bucketKey,
        mime_type: dto.mimeType,
        size_bytes: dto.sizeBytes ?? null,
        status: 'UPLOADING',
        created_by: ownerId,
        updated_by: ownerId,
      })
      .select(FILE_COLUMNS)
      .single();
    if (error) throw new InternalServerErrorException(error.message);

    return { file: data as unknown as StoredFile, uploadUrl: signed.signedUrl, token: signed.token };
  }

  async findById(id: string, requesterId: string): Promise<FileWithReadUrl> {
    const { data, error } = await this.db
      .select(FILE_COLUMNS)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    let file = data as unknown as StoredFile | null;
    if (!file || file.owner_id !== requesterId) throw new NotFoundException(`File ${id} not found`);

    if (file.status === 'UPLOADING') {
      file = await this.reconcileUpload(file);
    }
    if (file.status !== 'AVAILABLE') return file;

    const { data: signed } = await this.bucket.createSignedUrl(file.bucket_key, READ_URL_TTL_SECONDS);
    return { ...file, readUrl: signed?.signedUrl };
  }

  async remove(id: string, requesterId: string): Promise<void> {
    const file = await this.findById(id, requesterId);
    if (file.owner_id !== requesterId) throw new ForbiddenException('Permission denied');

    const { error } = await this.db
      .update({ status: 'DELETED', deleted_at: new Date().toISOString(), updated_by: requesterId })
      .eq('id', id);
    if (error) throw new InternalServerErrorException(error.message);
  }

  /**
   * Owner-agnostic read access for content whose visibility is decided elsewhere (e.g. a
   * PUBLISHED testimony's photo/audio/video, visible to anyone who can see the testimony —
   * not just the uploader). Callers are responsible for their own visibility check before
   * calling this; it deliberately skips the owner_id check that `findById` enforces.
   */
  async getPublicReadUrl(fileId: string): Promise<string | null> {
    const { data, error } = await this.db.select(FILE_COLUMNS).eq('id', fileId).is('deleted_at', null).maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    let file = data as unknown as StoredFile | null;
    if (!file) return null;

    if (file.status === 'UPLOADING') {
      file = await this.reconcileUpload(file);
    }
    if (file.status !== 'AVAILABLE') return null;

    const { data: signed } = await this.bucket.createSignedUrl(file.bucket_key, READ_URL_TTL_SECONDS);
    return signed?.signedUrl ?? null;
  }

  /**
   * No async scan/transcode Worker exists yet (see docs/03_ARCHITECTURE_SPECIFICATION.md
   * section 9) — this checks Supabase Storage directly and moves UPLOADING straight to
   * AVAILABLE once the object exists, collapsing the UPLOADED/SCANNED intermediate states.
   */
  private async reconcileUpload(file: StoredFile): Promise<StoredFile> {
    const { data: info, error } = await this.bucket.info(file.bucket_key);
    if (error || !info) return file;

    const { data, error: updateError } = await this.db
      .update({ status: 'AVAILABLE', size_bytes: info.size ?? file.size_bytes })
      .eq('id', file.id)
      .select(FILE_COLUMNS)
      .single();
    if (updateError) throw new InternalServerErrorException(updateError.message);
    return data as unknown as StoredFile;
  }
}
