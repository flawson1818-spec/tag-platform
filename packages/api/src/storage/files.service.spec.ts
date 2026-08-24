import { FilesService } from './files.service';
import { createQueryChain, createSupabaseServiceMock } from '../testing/supabase-query-mock';

const UPLOADING_FILE = {
  id: 'file-1',
  owner_id: 'user-1',
  bucket_key: 'user-1/file-1-photo.jpg',
  mime_type: 'image/jpeg',
  size_bytes: null,
  status: 'UPLOADING',
  scan_result: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  deleted_at: null,
};

const AVAILABLE_FILE = { ...UPLOADING_FILE, status: 'AVAILABLE', size_bytes: 2048 };

/** `storage.from(bucket)` is a completely different (non-query-builder) interface than `.from(table)`. */
function buildStorageBucket(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    createSignedUploadUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://upload.example/url', token: 'upload-token' }, error: null }),
    createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://read.example/url' }, error: null }),
    info: vi.fn().mockResolvedValue({ data: { size: 2048 }, error: null }),
    ...overrides,
  };
}

function buildService(perTable: Record<string, unknown>, storageOverrides: Partial<Record<string, unknown>> = {}) {
  const supabaseMock = createSupabaseServiceMock(perTable as never);
  const bucket = buildStorageBucket(storageOverrides);
  const supabase = { client: { ...supabaseMock.client, storage: { from: vi.fn(() => bucket) } } };
  const service = new FilesService(supabase as never);
  return { service, bucket };
}

describe('FilesService', () => {
  describe('presign', () => {
    it('sanitizes the filename and scopes the bucket key under the owner', async () => {
      const chain = createQueryChain({ data: UPLOADING_FILE, error: null });
      const { service, bucket } = buildService({ files: chain });

      const result = await service.presign('user-1', { filename: 'my photo (1).jpg', mimeType: 'image/jpeg' } as never);

      expect(bucket.createSignedUploadUrl).toHaveBeenCalledWith(expect.stringMatching(/^user-1\/[a-f0-9-]+-my_photo__1_\.jpg$/));
      expect(result.uploadUrl).toBe('https://upload.example/url');
      expect(result.token).toBe('upload-token');
    });

    it('records the row at status UPLOADING', async () => {
      const chain = createQueryChain({ data: UPLOADING_FILE, error: null });
      const { service } = buildService({ files: chain });

      await service.presign('user-1', { filename: 'a.jpg', mimeType: 'image/jpeg' } as never);

      expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({ owner_id: 'user-1', status: 'UPLOADING' }));
    });
  });

  describe('findById — ownership', () => {
    it('hides a file owned by someone else (404, not 403)', async () => {
      const chain = createQueryChain({ data: UPLOADING_FILE, error: null });
      const { service } = buildService({ files: chain });

      await expect(service.findById('file-1', 'someone-else')).rejects.toThrow('File file-1 not found');
    });

    it('reconciles an UPLOADING file to AVAILABLE once the object exists in storage', async () => {
      const initialSelect = createQueryChain({ data: UPLOADING_FILE, error: null });
      const reconcileUpdate = createQueryChain({ data: AVAILABLE_FILE, error: null });
      const { service, bucket } = buildService({ files: [initialSelect, reconcileUpdate] });

      const result = await service.findById('file-1', 'user-1');

      expect(bucket.info).toHaveBeenCalledWith('user-1/file-1-photo.jpg');
      expect(reconcileUpdate.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'AVAILABLE', size_bytes: 2048 }));
      expect(result.readUrl).toBe('https://read.example/url');
    });

    it('leaves the file UPLOADING (no read URL) when the object is not in storage yet', async () => {
      const chain = createQueryChain({ data: UPLOADING_FILE, error: null });
      const { service, bucket } = buildService(
        { files: chain },
        { info: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }) },
      );

      const result = await service.findById('file-1', 'user-1');

      expect(result.status).toBe('UPLOADING');
      expect(result.readUrl).toBeUndefined();
      expect(bucket.createSignedUrl).not.toHaveBeenCalled();
    });

    it('returns a signed read URL for an already-AVAILABLE file without reconciling again', async () => {
      const chain = createQueryChain({ data: AVAILABLE_FILE, error: null });
      const { service, bucket } = buildService({ files: chain });

      const result = await service.findById('file-1', 'user-1');

      expect(bucket.info).not.toHaveBeenCalled();
      expect(result.readUrl).toBe('https://read.example/url');
    });
  });

  describe('remove', () => {
    it('soft-deletes a file the caller owns', async () => {
      const chain = createQueryChain({ data: AVAILABLE_FILE, error: null });
      const { service } = buildService({ files: chain });

      await service.remove('file-1', 'user-1');

      expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'DELETED', deleted_at: expect.any(String) }));
    });
  });

  describe('getPublicReadUrl — owner-agnostic', () => {
    it('returns a signed URL for an AVAILABLE file regardless of caller identity (no owner check)', async () => {
      const chain = createQueryChain({ data: AVAILABLE_FILE, error: null });
      const { service } = buildService({ files: chain });

      const url = await service.getPublicReadUrl('file-1');

      expect(url).toBe('https://read.example/url');
    });

    it('returns null for a file that does not exist', async () => {
      const chain = createQueryChain({ data: null, error: null });
      const { service } = buildService({ files: chain });

      const url = await service.getPublicReadUrl('missing');

      expect(url).toBeNull();
    });

    it('returns null while the file is still UPLOADING and not yet reconciled', async () => {
      const chain = createQueryChain({ data: UPLOADING_FILE, error: null });
      const { service } = buildService(
        { files: chain },
        { info: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }) },
      );

      const url = await service.getPublicReadUrl('file-1');

      expect(url).toBeNull();
    });
  });
});
