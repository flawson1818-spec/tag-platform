import { MfaRecoveryCodesService } from './mfa-recovery-codes.service';
import { PasswordService } from './password.service';
import { createQueryChain, createSupabaseServiceMock } from '../testing/supabase-query-mock';

function buildService(chain: ReturnType<typeof createQueryChain>, passwordService = new PasswordService()) {
  const supabase = createSupabaseServiceMock({ mfa_recovery_codes: chain });
  return new MfaRecoveryCodesService(supabase as never, passwordService);
}

describe('MfaRecoveryCodesService', () => {
  describe('generate', () => {
    it('returns 10 distinct plaintext codes and deletes any prior set first', async () => {
      const chain = createQueryChain({ data: null, error: null });
      const service = buildService(chain);

      const codes = await service.generate('user-1');

      expect(codes).toHaveLength(10);
      expect(new Set(codes).size).toBe(10);
      expect(codes.every((c) => /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/.test(c))).toBe(true);
      expect(chain.delete).toHaveBeenCalled();
      expect(chain.insert).toHaveBeenCalled();
    });

    it('inserts hashed codes, never the plaintext', async () => {
      const chain = createQueryChain({ data: null, error: null });
      const service = buildService(chain);

      const codes = await service.generate('user-1', 1);

      const inserted = (chain.insert as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(inserted).toHaveLength(1);
      expect(inserted[0].user_id).toBe('user-1');
      expect(inserted[0].code_hash).toMatch(/^\$argon2id\$/);
      expect(inserted[0].code_hash).not.toBe(codes[0]);
    });
  });

  describe('consume', () => {
    it('consumes a matching unused code and marks it used', async () => {
      const passwordService = new PasswordService();
      const hash = await passwordService.hash('AAAA-BBBB-CCCC');
      const chain = createQueryChain({ data: [{ id: 'code-1', code_hash: hash }], error: null });
      const supabase = createSupabaseServiceMock({ mfa_recovery_codes: chain });
      const service = new MfaRecoveryCodesService(supabase as never, passwordService);

      const result = await service.consume('user-1', 'AAAA-BBBB-CCCC');

      expect(result).toBe(true);
      expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({ used_at: expect.any(String) }));
      expect(chain.eq).toHaveBeenCalledWith('id', 'code-1');
    });

    it('returns false when no unused code matches', async () => {
      const passwordService = new PasswordService();
      const hash = await passwordService.hash('AAAA-BBBB-CCCC');
      const chain = createQueryChain({ data: [{ id: 'code-1', code_hash: hash }], error: null });
      const service = buildService(chain, passwordService);

      const result = await service.consume('user-1', 'WRONG-CODE-0000');

      expect(result).toBe(false);
      expect(chain.update).not.toHaveBeenCalled();
    });

    it('only considers unused codes', async () => {
      const chain = createQueryChain({ data: [], error: null });
      const service = buildService(chain);

      await service.consume('user-1', 'AAAA-BBBB-CCCC');

      expect(chain.is).toHaveBeenCalledWith('used_at', null);
    });
  });

  describe('deleteAll', () => {
    it('deletes every code for the user', async () => {
      const chain = createQueryChain({ data: null, error: null });
      const service = buildService(chain);

      await service.deleteAll('user-1');

      expect(chain.delete).toHaveBeenCalled();
      expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1');
    });
  });
});
