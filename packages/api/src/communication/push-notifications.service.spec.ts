import { PushNotificationsService, WebPushClient } from './push-notifications.service';
import { createQueryChain, createSupabaseServiceMock } from '../testing/supabase-query-mock';

function buildFakeWebpushClient(): WebPushClient & { setVapidDetails: ReturnType<typeof vi.fn>; sendNotification: ReturnType<typeof vi.fn> } {
  return {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  };
}

describe('PushNotificationsService', () => {
  describe('registerToken', () => {
    it('upserts on (user_id, token) so re-registering the same device is idempotent', async () => {
      const chain = createQueryChain({
        data: { id: 'token-1', user_id: 'user-1', token: 'abc', platform: 'ANDROID', created_at: '2026-01-01T00:00:00.000Z' },
        error: null,
      });
      const supabase = createSupabaseServiceMock({ push_tokens: chain });
      const service = new PushNotificationsService(supabase as never);

      const result = await service.registerToken('user-1', 'abc', 'ANDROID');

      expect(chain.upsert).toHaveBeenCalledWith(
        { user_id: 'user-1', token: 'abc', platform: 'ANDROID' },
        { onConflict: 'user_id,token' },
      );
      expect(result.platform).toBe('ANDROID');
    });

    it('defaults platform to UNKNOWN when not provided', async () => {
      const chain = createQueryChain({
        data: { id: 'token-1', user_id: 'user-1', token: 'abc', platform: 'UNKNOWN', created_at: '2026-01-01T00:00:00.000Z' },
        error: null,
      });
      const supabase = createSupabaseServiceMock({ push_tokens: chain });
      const service = new PushNotificationsService(supabase as never);

      await service.registerToken('user-1', 'abc');

      expect(chain.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ platform: 'UNKNOWN' }),
        expect.anything(),
      );
    });
  });

  describe('unregisterToken', () => {
    it('deletes only the given user+token pair', async () => {
      const chain = createQueryChain({ data: null, error: null });
      const supabase = createSupabaseServiceMock({ push_tokens: chain });
      const service = new PushNotificationsService(supabase as never);

      await service.unregisterToken('user-1', 'abc');

      expect(chain.delete).toHaveBeenCalled();
      expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1');
      expect(chain.eq).toHaveBeenCalledWith('token', 'abc');
    });
  });

  describe('send', () => {
    it('returns an empty array without writing anything when the user has no registered device', async () => {
      const notificationsChain = createQueryChain({ data: [], error: null });
      const supabase = createSupabaseServiceMock({
        push_tokens: createQueryChain({ data: [], error: null }),
        push_notifications: notificationsChain,
      });
      const service = new PushNotificationsService(supabase as never);

      const result = await service.send('user-1', 'Titre', 'Corps');

      expect(result).toEqual([]);
      expect(notificationsChain.insert).not.toHaveBeenCalled();
    });

    it('records one push_notifications row per registered device, honestly at status CREATED', async () => {
      const tokens = [
        { id: 'token-1', user_id: 'user-1', token: 'a', platform: 'IOS' },
        { id: 'token-2', user_id: 'user-1', token: 'b', platform: 'ANDROID' },
      ];
      const notificationsChain = createQueryChain({
        data: tokens.map((t) => ({ id: `push-${t.id}`, user_id: 'user-1', push_token_id: t.id, title: 'Titre', body: 'Corps', status: 'CREATED', sent_at: null, created_at: '2026-01-01T00:00:00.000Z' })),
        error: null,
      });
      const supabase = createSupabaseServiceMock({
        push_tokens: createQueryChain({ data: tokens, error: null }),
        push_notifications: notificationsChain,
      });
      const service = new PushNotificationsService(supabase as never);

      const result = await service.send('user-1', 'Titre', 'Corps');

      expect(notificationsChain.insert).toHaveBeenCalledWith([
        expect.objectContaining({ push_token_id: 'token-1', status: 'CREATED' }),
        expect.objectContaining({ push_token_id: 'token-2', status: 'CREATED' }),
      ]);
      expect(result).toHaveLength(2);
    });

    /**
     * Injects a plain fake WebPushClient via the constructor rather than mocking the 'web-push'
     * module. Real 'web-push' exports live on a frozen ESM namespace object that Vitest cannot
     * vi.mock/vi.spyOn reliably in this project's nx-driven test run (reproducible only when
     * many spec files execute together, never in isolation) — constructor injection sidesteps
     * module interception entirely.
     */
    describe('WEB platform with VAPID configured', () => {
      beforeEach(() => {
        vi.stubEnv('VAPID_PUBLIC_KEY', 'public-key');
        vi.stubEnv('VAPID_PRIVATE_KEY', 'private-key');
        vi.stubEnv('VAPID_SUBJECT', 'mailto:admin@example.com');
      });

      afterEach(() => {
        vi.unstubAllEnvs();
      });

      it('delivers via web-push and records DELIVERED on success', async () => {
        const webpushClient = buildFakeWebpushClient();
        webpushClient.sendNotification.mockResolvedValue(undefined);
        const tokens = [
          { id: 'token-1', user_id: 'user-1', token: JSON.stringify({ endpoint: 'https://push.example/1' }), platform: 'WEB' },
        ];
        const notificationsChain = createQueryChain({ data: [], error: null });
        const supabase = createSupabaseServiceMock({
          push_tokens: createQueryChain({ data: tokens, error: null }),
          push_notifications: notificationsChain,
        });
        const service = new PushNotificationsService(supabase as never, webpushClient);

        await service.send('user-1', 'Titre', 'Corps');

        expect(webpushClient.setVapidDetails).toHaveBeenCalledWith('mailto:admin@example.com', 'public-key', 'private-key');
        expect(webpushClient.sendNotification).toHaveBeenCalledWith(
          { endpoint: 'https://push.example/1' },
          JSON.stringify({ title: 'Titre', body: 'Corps' }),
        );
        expect(notificationsChain.insert).toHaveBeenCalledWith([
          expect.objectContaining({ push_token_id: 'token-1', status: 'DELIVERED' }),
        ]);
      });

      it('records FAILED when web-push rejects (e.g. expired subscription)', async () => {
        const webpushClient = buildFakeWebpushClient();
        webpushClient.sendNotification.mockRejectedValue(new Error('410 Gone'));
        const tokens = [
          { id: 'token-1', user_id: 'user-1', token: JSON.stringify({ endpoint: 'https://push.example/1' }), platform: 'WEB' },
        ];
        const notificationsChain = createQueryChain({ data: [], error: null });
        const supabase = createSupabaseServiceMock({
          push_tokens: createQueryChain({ data: tokens, error: null }),
          push_notifications: notificationsChain,
        });
        const service = new PushNotificationsService(supabase as never, webpushClient);

        await service.send('user-1', 'Titre', 'Corps');

        expect(notificationsChain.insert).toHaveBeenCalledWith([
          expect.objectContaining({ push_token_id: 'token-1', status: 'FAILED' }),
        ]);
      });

      it('falls back to CREATED (no delivery attempt) when VAPID is not configured', async () => {
        // This machine's .env may genuinely have real VAPID keys configured for the live app —
        // stub to empty rather than unstub, so the "not configured" branch is deterministic
        // regardless of ambient environment.
        vi.stubEnv('VAPID_PUBLIC_KEY', '');
        vi.stubEnv('VAPID_PRIVATE_KEY', '');
        const webpushClient = buildFakeWebpushClient();
        const tokens = [
          { id: 'token-1', user_id: 'user-1', token: JSON.stringify({ endpoint: 'https://push.example/1' }), platform: 'WEB' },
        ];
        const notificationsChain = createQueryChain({ data: [], error: null });
        const supabase = createSupabaseServiceMock({
          push_tokens: createQueryChain({ data: tokens, error: null }),
          push_notifications: notificationsChain,
        });
        const service = new PushNotificationsService(supabase as never, webpushClient);

        await service.send('user-1', 'Titre', 'Corps');

        expect(webpushClient.sendNotification).not.toHaveBeenCalled();
        expect(notificationsChain.insert).toHaveBeenCalledWith([
          expect.objectContaining({ push_token_id: 'token-1', status: 'CREATED' }),
        ]);
      });
    });
  });

  describe('getVapidPublicKey', () => {
    it('returns null when VAPID is not configured', () => {
      vi.stubEnv('VAPID_PUBLIC_KEY', '');
      const supabase = createSupabaseServiceMock({});
      const service = new PushNotificationsService(supabase as never, buildFakeWebpushClient());

      expect(service.getVapidPublicKey()).toBeNull();

      vi.unstubAllEnvs();
    });
  });
});
