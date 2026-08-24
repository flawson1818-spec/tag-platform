import { UsersService } from './users.service';
import { createQueryChain, createSupabaseServiceMock } from '../testing/supabase-query-mock';

const USER_ROW = {
  id: 'user-1',
  email: 'believer@example.com',
  phone: '+22500000000',
  password_hash: 'hashed',
  display_name: 'Believer',
  avatar_file_id: 'file-1',
  locale: 'fr',
  timezone: 'UTC',
  status: 'ACTIVE',
  mfa_enabled: false,
  email_verified_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  deleted_at: null,
};

function buildDeps(overrides: Partial<Record<string, unknown>> = {}) {
  const auditLogService = { record: vi.fn().mockResolvedValue(undefined) };
  const supabase = overrides.supabase ?? createSupabaseServiceMock({});
  const service = new UsersService(supabase as never, auditLogService as never);
  return { service, auditLogService, supabase };
}

describe('UsersService', () => {
  describe('exportMyData', () => {
    it('aggregates the profile alongside every domain the user authored, never touching password_hash', async () => {
      const supabase = createSupabaseServiceMock({
        users: createQueryChain({ data: USER_ROW, error: null }),
        prayer_requests: createQueryChain({ data: [{ id: 'req-1' }], error: null }),
        testimonies: createQueryChain({ data: [{ id: 'testi-1' }], error: null }),
        event_participants: createQueryChain({ data: [], error: null }),
        notifications: createQueryChain({ data: [{ id: 'notif-1' }], error: null }),
        ai_interaction_logs: createQueryChain({ data: [{ id: 'log-1' }], error: null }),
      });
      const { service } = buildDeps({ supabase });

      const result = await service.exportMyData('user-1');

      expect(result.prayerRequests).toEqual([{ id: 'req-1' }]);
      expect(result.testimonies).toEqual([{ id: 'testi-1' }]);
      expect(result.notifications).toEqual([{ id: 'notif-1' }]);
      expect(result.aiInteractions).toEqual([{ id: 'log-1' }]);
      expect((result.profile as { password_hash?: string }).password_hash).toBeUndefined();
      expect((result.profile as { email: string }).email).toBe('believer@example.com');
      expect(typeof result.exportedAt).toBe('string');
    });

    it('throws if the user does not exist', async () => {
      const supabase = createSupabaseServiceMock({
        users: createQueryChain({ data: null, error: null }),
      });
      const { service } = buildDeps({ supabase });

      await expect(service.exportMyData('missing')).rejects.toThrow('User missing not found');
    });
  });

  describe('deleteMyAiHistory', () => {
    it('deletes only the caller ai_interaction_logs rows', async () => {
      const chain = createQueryChain({ data: null, error: null });
      const supabase = createSupabaseServiceMock({ ai_interaction_logs: chain });
      const { service } = buildDeps({ supabase });

      await service.deleteMyAiHistory('user-1');

      expect(chain.delete).toHaveBeenCalled();
      expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1');
    });
  });

  describe('deleteMyAccount', () => {
    it('scrubs PII, marks DELETED, revokes active refresh tokens, and audit-logs the erasure', async () => {
      const usersChain = createQueryChain({ data: USER_ROW, error: null });
      const tokensChain = createQueryChain({ data: null, error: null });
      const supabase = createSupabaseServiceMock({ users: usersChain, refresh_tokens: tokensChain });
      const { service, auditLogService } = buildDeps({ supabase });

      await service.deleteMyAccount('user-1');

      expect(usersChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'DELETED',
          email: 'deleted-user-1@tag.invalid',
          phone: null,
          display_name: 'Compte supprimé',
          avatar_file_id: null,
        }),
      );
      expect(tokensChain.update).toHaveBeenCalledWith(expect.objectContaining({ revoked_at: expect.any(String) }));
      expect(tokensChain.eq).toHaveBeenCalledWith('user_id', 'user-1');
      expect(tokensChain.is).toHaveBeenCalledWith('revoked_at', null);
      expect(auditLogService.record).toHaveBeenCalledWith('user-1', 'USER_SELF_DELETED', 'user', 'user-1');
    });

    it('refuses to delete an account that does not exist (or is already deleted)', async () => {
      const supabase = createSupabaseServiceMock({
        users: createQueryChain({ data: null, error: null }),
      });
      const { service } = buildDeps({ supabase });

      await expect(service.deleteMyAccount('missing')).rejects.toThrow('User missing not found');
    });
  });

  describe('softDelete (admin-triggered)', () => {
    it('marks DELETED without scrubbing PII, and audit-logs with the acting admin', async () => {
      const usersChain = createQueryChain({ data: USER_ROW, error: null });
      const supabase = createSupabaseServiceMock({ users: usersChain });
      const { service, auditLogService } = buildDeps({ supabase });

      await service.softDelete('user-1', 'admin-1');

      expect(usersChain.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'DELETED' }),
      );
      expect(usersChain.update).not.toHaveBeenCalledWith(expect.objectContaining({ email: expect.anything() }));
      expect(auditLogService.record).toHaveBeenCalledWith('admin-1', 'USER_DELETED', 'user', 'user-1');
    });
  });

  describe('updateStatus', () => {
    it('audit-logs the before/after status transition', async () => {
      const supabase = createSupabaseServiceMock({
        users: [
          createQueryChain({ data: USER_ROW, error: null }), // findById (before)
          createQueryChain({ data: { ...USER_ROW, status: 'SUSPENDED' }, error: null }), // update
        ],
      });
      const { service, auditLogService } = buildDeps({ supabase });

      const result = await service.updateStatus('user-1', 'SUSPENDED', 'admin-1');

      expect(result.status).toBe('SUSPENDED');
      expect(auditLogService.record).toHaveBeenCalledWith(
        'admin-1',
        'USER_STATUS_CHANGED',
        'user',
        'user-1',
        { status: 'ACTIVE' },
        { status: 'SUSPENDED' },
      );
    });
  });

  describe('getMfaSecret / setMfaEnabled', () => {
    it('never selects mfa_secret through the general USER_COLUMNS path', async () => {
      const chain = createQueryChain({ data: { mfa_secret: 'top-secret' }, error: null });
      const supabase = createSupabaseServiceMock({ users: chain });
      const { service } = buildDeps({ supabase });

      const secret = await service.getMfaSecret('user-1');

      expect(secret).toBe('top-secret');
      expect(chain.select).toHaveBeenCalledWith('mfa_secret');
    });

    it('clears mfa_secret when disabling MFA', async () => {
      const chain = createQueryChain({ data: null, error: null });
      const supabase = createSupabaseServiceMock({ users: chain });
      const { service } = buildDeps({ supabase });

      await service.setMfaEnabled('user-1', false);

      expect(chain.update).toHaveBeenCalledWith({ mfa_enabled: false, mfa_secret: null });
    });
  });
});
