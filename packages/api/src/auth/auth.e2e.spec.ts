import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthModule } from './auth.module';
import { SupabaseService } from '../supabase/supabase.service';
import { createQueryChain, createSupabaseServiceMock } from '../testing/supabase-query-mock';

const VISITEUR_ROLE = { id: 'role-visiteur', code: 'VISITEUR', label: 'Visiteur' };

const EXISTING_USER = {
  id: 'user-1',
  email: 'existing@example.com',
  phone: null,
  // argon2id hash of "Str0ng!Passw0rd"
  password_hash: '$argon2id$v=19$m=65536,p=4,t=3$VIPEOmZi5waqEh3jajkbIA$OXZ2lxBDLo7up9B/Ji8+g9rE7dt5uE2Az80Ds1QLVh0',
  display_name: 'Existing Believer',
  avatar_file_id: null,
  locale: 'fr',
  timezone: 'UTC',
  status: 'ACTIVE',
  mfa_enabled: false,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  deleted_at: null,
};

/** Builds a fresh app per test so each test's Supabase mock is isolated. */
async function buildApp(
  perTable: Record<string, ReturnType<typeof createQueryChain> | ReturnType<typeof createQueryChain>[]>,
): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AuthModule] })
    .overrideProvider(SupabaseService)
    .useValue(createSupabaseServiceMock(perTable))
    .compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  app.setGlobalPrefix('api');
  await app.init();
  return app;
}

describe('Auth (e2e)', () => {
  let app: INestApplication | null = null;

  afterEach(async () => {
    await app?.close();
    app = null;
  });

  describe('POST /api/auth/register', () => {
    it('registers a new user end-to-end: DTO validation, service logic, and real HTTP response shape', async () => {
      const createdUser = { ...EXISTING_USER, id: 'user-2', email: 'new@example.com' };
      app = await buildApp({
        users: [
          createQueryChain({ data: null, error: null }), // findByEmail: no existing user
          createQueryChain({ data: createdUser, error: null }), // insert
        ],
        roles: createQueryChain({ data: VISITEUR_ROLE, error: null }),
        role_assignments: createQueryChain({ data: null, error: null }),
        refresh_tokens: createQueryChain({ data: null, error: null }),
        email_verification_tokens: createQueryChain({ data: null, error: null }),
        emails: createQueryChain({ data: null, error: null }),
      });

      const res = await request(app.getHttpServer()).post('/api/auth/register').send({
        email: 'new@example.com',
        password: 'Str0ng!Passw0rd',
        displayName: 'New Believer',
      });

      expect(res.status).toBe(201);
      expect(res.body.access_token).toEqual(expect.any(String));
      expect(res.body.refresh_token).toEqual(expect.any(String));
      expect(res.body.user.email).toBe('new@example.com');
      expect(res.body.user.password_hash).toBeUndefined();
    });

    it('rejects a payload that fails DTO validation before any service logic runs (weak password)', async () => {
      app = await buildApp({});

      const res = await request(app.getHttpServer()).post('/api/auth/register').send({
        email: 'new@example.com',
        password: 'weak',
        displayName: 'New Believer',
      });

      expect(res.status).toBe(400);
      expect(res.body.message.join(' ')).toMatch(/password/i);
    });

    it('rejects an unknown extra field (forbidNonWhitelisted)', async () => {
      app = await buildApp({});

      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'new@example.com',
          password: 'Str0ng!Passw0rd',
          displayName: 'New Believer',
          isAdmin: true,
        });

      expect(res.status).toBe(400);
    });

    it('returns 409 for an email that is already registered', async () => {
      app = await buildApp({
        users: createQueryChain({ data: EXISTING_USER, error: null }),
      });

      const res = await request(app.getHttpServer()).post('/api/auth/register').send({
        email: 'existing@example.com',
        password: 'Str0ng!Passw0rd',
        displayName: 'Someone',
      });

      expect(res.status).toBe(409);
    });
  });

  describe('POST /api/auth/login', () => {
    it('returns 401 with a generic message for a wrong password (no user enumeration)', async () => {
      app = await buildApp({
        users: createQueryChain({ data: EXISTING_USER, error: null }),
      });

      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'existing@example.com', password: 'definitely-wrong' });

      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Invalid credentials');
    });

    it('returns 401 for an email that does not exist, with the same message as a wrong password', async () => {
      app = await buildApp({
        users: createQueryChain({ data: null, error: null }),
      });

      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'nobody@example.com', password: 'whatever123!' });

      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Invalid credentials');
    });

    it('rejects a malformed email at the DTO layer without touching the database', async () => {
      app = await buildApp({});

      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'not-an-email', password: 'whatever123!' });

      expect(res.status).toBe(400);
    });

    it('returns an MFA challenge instead of tokens for an MFA-enabled account, with correct credentials', async () => {
      app = await buildApp({
        users: createQueryChain({ data: { ...EXISTING_USER, mfa_enabled: true }, error: null }),
      });

      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'existing@example.com', password: 'Str0ng!Passw0rd' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ mfaRequired: true, mfaToken: expect.any(String) });
    });
  });

  describe('POST /api/auth/mfa/challenge', () => {
    it('rejects a garbage mfaToken', async () => {
      app = await buildApp({});

      const res = await request(app.getHttpServer())
        .post('/api/auth/mfa/challenge')
        .send({ mfaToken: 'not-a-real-token', code: '123456' });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('returns 401 for an unknown refresh token', async () => {
      app = await buildApp({
        refresh_tokens: createQueryChain({ data: null, error: null }),
      });

      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: 'nonexistent-token' });

      expect(res.status).toBe(401);
    });
  });
});
