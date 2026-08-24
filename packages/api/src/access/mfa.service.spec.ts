import { authenticator } from 'otplib';
import { MfaService } from './mfa.service';

describe('MfaService', () => {
  const service = new MfaService();

  describe('generateSecret', () => {
    it('generates a non-empty base32 secret, different on every call', () => {
      const a = service.generateSecret();
      const b = service.generateSecret();

      expect(a).toMatch(/^[A-Z2-7]+$/);
      expect(a.length).toBeGreaterThan(10);
      expect(a).not.toBe(b);
    });
  });

  describe('keyUri', () => {
    it('produces an otpauth:// URI naming TAG as the issuer and the account email', () => {
      const secret = service.generateSecret();

      const uri = service.keyUri('believer@example.com', secret);

      expect(uri).toMatch(/^otpauth:\/\/totp\//);
      expect(uri).toContain('TAG');
      expect(uri).toContain(encodeURIComponent('believer@example.com'));
      expect(uri).toContain(secret);
    });
  });

  describe('verify', () => {
    it('accepts the current valid TOTP code for the secret', () => {
      const secret = service.generateSecret();
      const validCode = authenticator.generate(secret);

      expect(service.verify(validCode, secret)).toBe(true);
    });

    it('rejects a wrong code', () => {
      const secret = service.generateSecret();
      const wrongCode = authenticator.generate(secret) === '000000' ? '111111' : '000000';

      expect(service.verify(wrongCode, secret)).toBe(false);
    });

    it('rejects a code checked against a different secret', () => {
      const secretA = service.generateSecret();
      const secretB = service.generateSecret();
      const codeForA = authenticator.generate(secretA);

      expect(service.verify(codeForA, secretB)).toBe(false);
    });

    it('returns false instead of throwing on a malformed code/secret pair', () => {
      expect(service.verify('not-a-valid-code', 'not-a-valid-secret')).toBe(false);
    });
  });
});
