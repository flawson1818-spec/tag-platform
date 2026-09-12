import { TrustedDevicesService } from './trusted-devices.service';
import { createQueryChain, createSupabaseServiceMock } from '../testing/supabase-query-mock';

function buildService(chain: ReturnType<typeof createQueryChain>) {
  const supabase = createSupabaseServiceMock({ trusted_devices: chain });
  const tokenService = { hashToken: (raw: string) => `hash(${raw})` };
  return new TrustedDevicesService(supabase as never, tokenService as never);
}

describe('TrustedDevicesService', () => {
  describe('trust', () => {
    it('inserts a hashed token and returns the plaintext once', async () => {
      const chain = createQueryChain({ data: null, error: null });
      const service = buildService(chain);

      const token = await service.trust('user-1', 'Mon téléphone');

      expect(token).toMatch(/^[0-9a-f]{64}$/);
      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: 'user-1', token_hash: `hash(${token})`, label: 'Mon téléphone' }),
      );
    });
  });

  describe('isTrusted', () => {
    it('returns false when no matching device exists', async () => {
      const chain = createQueryChain({ data: null, error: null });
      const service = buildService(chain);

      const result = await service.isTrusted('user-1', 'some-token');

      expect(result).toBe(false);
      expect(chain.eq).toHaveBeenCalledWith('token_hash', 'hash(some-token)');
    });

    it('returns false and does not touch last_used_at when the device has expired', async () => {
      const chain = createQueryChain({
        data: { id: 'device-1', expires_at: '2020-01-01T00:00:00.000Z' },
        error: null,
      });
      const service = buildService(chain);

      const result = await service.isTrusted('user-1', 'some-token');

      expect(result).toBe(false);
      expect(chain.update).not.toHaveBeenCalled();
    });

    it('returns true and refreshes last_used_at for a valid, unexpired device', async () => {
      const farFuture = new Date(Date.now() + 1000 * 60 * 60 * 24 * 10).toISOString();
      const chain = createQueryChain({ data: { id: 'device-1', expires_at: farFuture }, error: null });
      const service = buildService(chain);

      const result = await service.isTrusted('user-1', 'some-token');

      expect(result).toBe(true);
      expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({ last_used_at: expect.any(String) }));
    });
  });

  describe('list', () => {
    it('returns every device for the user, most recent first', async () => {
      const rows = [{ id: 'device-1', label: null, last_used_at: null, expires_at: '2026-02-01T00:00:00.000Z', created_at: '2026-01-01T00:00:00.000Z' }];
      const chain = createQueryChain({ data: rows, error: null });
      const service = buildService(chain);

      const result = await service.list('user-1');

      expect(result).toEqual(rows);
      expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false });
    });
  });

  describe('revoke', () => {
    it('deletes only the given device for that user', async () => {
      const chain = createQueryChain({ data: null, error: null });
      const service = buildService(chain);

      await service.revoke('user-1', 'device-1');

      expect(chain.eq).toHaveBeenCalledWith('id', 'device-1');
      expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1');
    });
  });

  describe('revokeAll', () => {
    it('deletes every device for the user', async () => {
      const chain = createQueryChain({ data: null, error: null });
      const service = buildService(chain);

      await service.revokeAll('user-1');

      expect(chain.delete).toHaveBeenCalled();
      expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1');
    });
  });
});
