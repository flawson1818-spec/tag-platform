import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  describe('hash', () => {
    it('produces an argon2id hash distinct from the plaintext', async () => {
      const hash = await service.hash('Str0ng!Passw0rd');

      expect(hash).toMatch(/^\$argon2id\$/);
      expect(hash).not.toContain('Str0ng!Passw0rd');
    });

    it('salts every hash differently, even for the same plaintext', async () => {
      const hashA = await service.hash('Str0ng!Passw0rd');
      const hashB = await service.hash('Str0ng!Passw0rd');

      expect(hashA).not.toBe(hashB);
    });
  });

  describe('verify', () => {
    it('accepts the correct plaintext against its own hash', async () => {
      const hash = await service.hash('Str0ng!Passw0rd');

      await expect(service.verify(hash, 'Str0ng!Passw0rd')).resolves.toBe(true);
    });

    it('rejects the wrong plaintext', async () => {
      const hash = await service.hash('Str0ng!Passw0rd');

      await expect(service.verify(hash, 'wrong-password')).resolves.toBe(false);
    });

    it('is case-sensitive', async () => {
      const hash = await service.hash('Str0ng!Passw0rd');

      await expect(service.verify(hash, 'str0ng!passw0rd')).resolves.toBe(false);
    });
  });
});
