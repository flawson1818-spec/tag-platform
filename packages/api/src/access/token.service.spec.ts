import { JwtService } from '@nestjs/jwt';
import { TokenService } from './token.service';

function createConfigServiceStub(values: Record<string, string | number> = {}) {
  return { get: (key: string) => values[key] } as never;
}

describe('TokenService', () => {
  const jwtService = new JwtService({ secret: 'test-secret' });

  describe('accessTokenExpiresInSeconds', () => {
    it('defaults to 900 seconds when unset', () => {
      const service = new TokenService(jwtService, createConfigServiceStub());
      expect(service.accessTokenExpiresInSeconds).toBe(900);
    });

    it('reads the configured value', () => {
      const service = new TokenService(
        jwtService,
        createConfigServiceStub({ JWT_ACCESS_EXPIRES_IN_SECONDS: 60 }),
      );
      expect(service.accessTokenExpiresInSeconds).toBe(60);
    });
  });

  describe('createAccessToken / verifyAccessToken', () => {
    let service: TokenService;

    beforeEach(() => {
      service = new TokenService(jwtService, createConfigServiceStub());
    });

    it('round-trips a payload through sign and verify', () => {
      const token = service.createAccessToken({ sub: 'user-1', email: 'a@b.com' });
      const decoded = service.verifyAccessToken(token);
      expect(decoded?.sub).toBe('user-1');
      expect(decoded?.email).toBe('a@b.com');
    });

    it('returns null for a garbage token instead of throwing', () => {
      expect(service.verifyAccessToken('not-a-jwt')).toBeNull();
    });

    it('returns null for a token signed with a different secret', () => {
      const otherService = new TokenService(
        new JwtService({ secret: 'a-completely-different-secret' }),
        createConfigServiceStub(),
      );
      const token = otherService.createAccessToken({ sub: 'user-1', email: 'a@b.com' });
      expect(service.verifyAccessToken(token)).toBeNull();
    });

    it('returns null for an expired token', () => {
      const shortLivedJwt = new JwtService({ secret: 'test-secret' });
      const token = shortLivedJwt.sign({ sub: 'user-1', email: 'a@b.com' }, { expiresIn: -1 });
      expect(service.verifyAccessToken(token)).toBeNull();
    });
  });

  describe('createRefreshTokenPair', () => {
    it('produces a random token whose hash matches hashToken()', () => {
      const service = new TokenService(jwtService, createConfigServiceStub());
      const pair = service.createRefreshTokenPair();
      expect(pair.token).toMatch(/^[0-9a-f]{96}$/);
      expect(pair.hash).toBe(service.hashToken(pair.token));
    });

    it('defaults expiry to 30 days out', () => {
      const service = new TokenService(jwtService, createConfigServiceStub());
      const before = Date.now();
      const pair = service.createRefreshTokenPair();
      const expectedMs = 30 * 24 * 60 * 60 * 1000;
      expect(pair.expiresAt.getTime()).toBeGreaterThanOrEqual(before + expectedMs - 1000);
      expect(pair.expiresAt.getTime()).toBeLessThanOrEqual(before + expectedMs + 5000);
    });

    it('honours a configured expiry in days', () => {
      const service = new TokenService(
        jwtService,
        createConfigServiceStub({ JWT_REFRESH_EXPIRES_IN_DAYS: 7 }),
      );
      const before = Date.now();
      const pair = service.createRefreshTokenPair();
      const expectedMs = 7 * 24 * 60 * 60 * 1000;
      expect(pair.expiresAt.getTime()).toBeGreaterThanOrEqual(before + expectedMs - 1000);
    });

    it('generates distinct tokens on successive calls', () => {
      const service = new TokenService(jwtService, createConfigServiceStub());
      const a = service.createRefreshTokenPair();
      const b = service.createRefreshTokenPair();
      expect(a.token).not.toBe(b.token);
      expect(a.hash).not.toBe(b.hash);
    });
  });

  describe('hashToken', () => {
    it('is deterministic', () => {
      const service = new TokenService(jwtService, createConfigServiceStub());
      expect(service.hashToken('abc')).toBe(service.hashToken('abc'));
    });

    it('produces a 64-char hex sha256 digest', () => {
      const service = new TokenService(jwtService, createConfigServiceStub());
      expect(service.hashToken('abc')).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});
