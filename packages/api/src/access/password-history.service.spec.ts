import { PasswordHistoryService } from './password-history.service';
import { PasswordService } from './password.service';
import { createQueryChain, createSupabaseServiceMock } from '../testing/supabase-query-mock';

function buildService(chain: ReturnType<typeof createQueryChain> | ReturnType<typeof createQueryChain>[], passwordService = new PasswordService()) {
  const supabase = createSupabaseServiceMock({ password_history: chain });
  return new PasswordHistoryService(supabase as never, passwordService);
}

describe('PasswordHistoryService', () => {
  describe('wasRecentlyUsed', () => {
    it('rejects re-using the current password without even querying history', async () => {
      const passwordService = new PasswordService();
      const currentHash = await passwordService.hash('CurrentP@ss1');
      const chain = createQueryChain({ data: [], error: null });
      const service = buildService(chain, passwordService);

      const result = await service.wasRecentlyUsed('user-1', currentHash, 'CurrentP@ss1');

      expect(result).toBe(true);
    });

    it('rejects a password matching one of the last 5 stored hashes', async () => {
      const passwordService = new PasswordService();
      const currentHash = await passwordService.hash('CurrentP@ss1');
      const oldHash = await passwordService.hash('OldP@ssword1');
      const chain = createQueryChain({ data: [{ password_hash: oldHash }], error: null });
      const service = buildService(chain, passwordService);

      const result = await service.wasRecentlyUsed('user-1', currentHash, 'OldP@ssword1');

      expect(result).toBe(true);
    });

    it('allows a genuinely new password', async () => {
      const passwordService = new PasswordService();
      const currentHash = await passwordService.hash('CurrentP@ss1');
      const oldHash = await passwordService.hash('OldP@ssword1');
      const chain = createQueryChain({ data: [{ password_hash: oldHash }], error: null });
      const service = buildService(chain, passwordService);

      const result = await service.wasRecentlyUsed('user-1', currentHash, 'BrandNewP@ss1');

      expect(result).toBe(false);
    });
  });

  describe('record', () => {
    it('inserts the replaced hash and prunes anything beyond the last 5', async () => {
      const insertChain = createQueryChain({ data: null, error: null });
      const pruneSelectChain = createQueryChain({
        data: [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }, { id: '5' }, { id: '6' }, { id: '7' }],
        error: null,
      });
      const service = buildService([insertChain, pruneSelectChain, pruneSelectChain]);

      await service.record('user-1', 'some-hash');

      expect(insertChain.insert).toHaveBeenCalledWith({ user_id: 'user-1', password_hash: 'some-hash' });
      expect(pruneSelectChain.delete).toHaveBeenCalled();
      expect(pruneSelectChain.in).toHaveBeenCalledWith('id', ['6', '7']);
    });

    it('does not attempt to delete anything when there is nothing stale', async () => {
      const insertChain = createQueryChain({ data: null, error: null });
      const pruneSelectChain = createQueryChain({ data: [{ id: '1' }], error: null });
      const service = buildService([insertChain, pruneSelectChain]);

      await service.record('user-1', 'some-hash');

      expect(pruneSelectChain.delete).not.toHaveBeenCalled();
    });
  });
});
