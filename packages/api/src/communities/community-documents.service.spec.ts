import { CommunityDocumentsService } from './community-documents.service';
import { createQueryChain, createSupabaseServiceMock } from '../testing/supabase-query-mock';

const DOCUMENT = {
  id: 'doc-1',
  community_id: 'community-1',
  file_id: 'file-1',
  title: 'Charte de la cellule',
  uploaded_by: 'leader-1',
  created_at: '2026-01-01T00:00:00.000Z',
};

function buildService(chain: ReturnType<typeof createQueryChain>, filesServiceOverrides: Partial<Record<string, unknown>> = {}) {
  const supabase = createSupabaseServiceMock({ community_documents: chain });
  const filesService = { getPublicReadUrl: vi.fn().mockResolvedValue('https://signed.example/doc.pdf'), ...filesServiceOverrides };
  const service = new CommunityDocumentsService(supabase as never, filesService as never);
  return { service, filesService };
}

describe('CommunityDocumentsService', () => {
  describe('create', () => {
    it('links an uploaded file to the community with a title', async () => {
      const chain = createQueryChain({ data: DOCUMENT, error: null });
      const { service } = buildService(chain);

      const result = await service.create('community-1', 'leader-1', 'file-1', 'Charte de la cellule');

      expect(chain.insert).toHaveBeenCalledWith({
        community_id: 'community-1',
        file_id: 'file-1',
        title: 'Charte de la cellule',
        uploaded_by: 'leader-1',
      });
      expect(result).toEqual(DOCUMENT);
    });
  });

  describe('list', () => {
    it('scopes to the given community, excluding soft-deleted rows, newest first', async () => {
      const chain = createQueryChain({ data: [DOCUMENT], error: null });
      const { service } = buildService(chain);

      await service.list('community-1');

      expect(chain.eq).toHaveBeenCalledWith('community_id', 'community-1');
      expect(chain.is).toHaveBeenCalledWith('deleted_at', null);
      expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false });
    });
  });

  describe('findById', () => {
    it('throws when the document does not exist', async () => {
      const chain = createQueryChain({ data: null, error: null });
      const { service } = buildService(chain);

      await expect(service.findById('missing')).rejects.toThrow('not found');
    });
  });

  describe('getReadUrl', () => {
    it('resolves the read URL through FilesService, bypassing the owner-only check', async () => {
      const chain = createQueryChain({ data: DOCUMENT, error: null });
      const { service, filesService } = buildService(chain);

      const url = await service.getReadUrl('doc-1');

      expect(filesService.getPublicReadUrl).toHaveBeenCalledWith('file-1');
      expect(url).toBe('https://signed.example/doc.pdf');
    });
  });

  describe('remove', () => {
    it('soft-deletes the document', async () => {
      const chain = createQueryChain({ data: DOCUMENT, error: null });
      const { service } = buildService(chain);

      await service.remove('doc-1');

      expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({ deleted_at: expect.any(String) }));
    });
  });
});
