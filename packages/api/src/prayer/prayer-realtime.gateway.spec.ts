import { PrayerRealtimeGateway } from './prayer-realtime.gateway';
import { ChatMessage } from './chat-message.entity';

const MESSAGE: ChatMessage = {
  id: 'message-1',
  community_id: null,
  author_id: 'user-1',
  author_display_name: 'Fidèle',
  content: 'contenu du message',
  status: 'VISIBLE',
  created_at: '2026-01-01T00:00:00.000Z',
};

function buildGateway(overrides: Partial<Record<string, unknown>> = {}) {
  const chatMessagesService = overrides.chatMessagesService ?? {
    flag: vi.fn().mockResolvedValue(undefined),
    hide: vi.fn().mockResolvedValue(undefined),
  };
  const aiModerationService = overrides.aiModerationService ?? { moderate: vi.fn() };
  const permissionsService =
    overrides.permissionsService ?? { listUserIdsWithAnyRole: vi.fn().mockResolvedValue([]) };
  const notificationsService = overrides.notificationsService ?? { create: vi.fn().mockResolvedValue(undefined) };
  const pushNotificationsService = overrides.pushNotificationsService ?? { send: vi.fn().mockResolvedValue([]) };

  const gateway = new PrayerRealtimeGateway(
    {} as never, // slotsService — unused by moderateChatMessage
    {} as never, // programsService
    {} as never, // tokenService
    chatMessagesService as never,
    permissionsService as never,
    {} as never, // supabase
    aiModerationService as never,
    notificationsService as never,
    pushNotificationsService as never,
  );

  return { gateway, chatMessagesService, aiModerationService, permissionsService, notificationsService, pushNotificationsService };
}

/** moderateChatMessage is private — same access pattern already used elsewhere in this repo's tests. */
function moderate(gateway: PrayerRealtimeGateway, roomId: string, message: ChatMessage, authorId: string) {
  return (gateway as unknown as { moderateChatMessage(r: string, m: ChatMessage, a: string): Promise<void> }).moderateChatMessage(
    roomId,
    message,
    authorId,
  );
}

describe('PrayerRealtimeGateway.moderateChatMessage', () => {
  it('does nothing when the message is not flagged', async () => {
    const { gateway, chatMessagesService, aiModerationService } = buildGateway({
      aiModerationService: { moderate: vi.fn().mockResolvedValue({ flagged: false, confidence: 0, reason: null, critical: false }) },
    });

    await moderate(gateway, 'world', MESSAGE, 'user-1');

    expect(chatMessagesService.flag).not.toHaveBeenCalled();
  });

  it('flags but does not hide or notify for a non-critical flag', async () => {
    const { gateway, chatMessagesService, notificationsService } = buildGateway({
      aiModerationService: {
        moderate: vi.fn().mockResolvedValue({ flagged: true, confidence: 0.6, reason: 'ton agressif', critical: false }),
      },
    });

    await moderate(gateway, 'world', MESSAGE, 'user-1');

    expect(chatMessagesService.flag).toHaveBeenCalledWith('message-1', 'ton agressif', 0.6);
    expect(notificationsService.create).not.toHaveBeenCalled();
  });

  it('hides the message and notifies every MODERATEUR+ user for a critical flag', async () => {
    const { gateway, chatMessagesService, notificationsService, pushNotificationsService } = buildGateway({
      aiModerationService: {
        moderate: vi.fn().mockResolvedValue({ flagged: true, confidence: 0.95, reason: 'contenu illégal', critical: true }),
      },
      permissionsService: { listUserIdsWithAnyRole: vi.fn().mockResolvedValue(['moderator-1', 'pastor-1']) },
    });

    await moderate(gateway, 'world', MESSAGE, 'user-1');

    expect(chatMessagesService.hide).toHaveBeenCalledWith('message-1');
    expect(notificationsService.create).toHaveBeenCalledWith(
      'moderator-1',
      'AI_CRITICAL_CONTENT_FLAGGED',
      { messageId: 'message-1', authorId: 'user-1' },
    );
    expect(notificationsService.create).toHaveBeenCalledWith(
      'pastor-1',
      'AI_CRITICAL_CONTENT_FLAGGED',
      { messageId: 'message-1', authorId: 'user-1' },
    );
    expect(pushNotificationsService.send).toHaveBeenCalledTimes(2);
  });

  it('still hides the message even when the recipient lookup fails', async () => {
    const { gateway, chatMessagesService, notificationsService } = buildGateway({
      aiModerationService: {
        moderate: vi.fn().mockResolvedValue({ flagged: true, confidence: 0.95, reason: 'contenu illégal', critical: true }),
      },
      permissionsService: { listUserIdsWithAnyRole: vi.fn().mockRejectedValue(new Error('db down')) },
    });

    await moderate(gateway, 'world', MESSAGE, 'user-1');

    expect(chatMessagesService.hide).toHaveBeenCalledWith('message-1');
    expect(notificationsService.create).not.toHaveBeenCalled();
  });
});
