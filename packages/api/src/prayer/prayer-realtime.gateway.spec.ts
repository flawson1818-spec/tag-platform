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
    countRecentFlagged: vi.fn().mockResolvedValue(0),
  };
  const aiModerationService = overrides.aiModerationService ?? { moderate: vi.fn() };
  const permissionsService =
    overrides.permissionsService ?? {
      listUserIdsWithAnyRole: vi.fn().mockResolvedValue([]),
      getUserPermissionCodes: vi.fn().mockResolvedValue(new Set<string>()),
    };
  const notificationsService = overrides.notificationsService ?? { create: vi.fn().mockResolvedValue(undefined) };
  const pushNotificationsService = overrides.pushNotificationsService ?? { send: vi.fn().mockResolvedValue([]) };
  const userMutesService = overrides.userMutesService ?? {
    activeMuteUntil: vi.fn().mockResolvedValue(null),
    mute: vi.fn().mockResolvedValue('2026-01-01T00:15:00.000Z'),
    unmute: vi.fn().mockResolvedValue(undefined),
  };

  const tokenService = overrides.tokenService ?? { verifyAccessToken: vi.fn().mockReturnValue(null) };
  const supabase = overrides.supabase ?? {
    client: { from: vi.fn(() => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })) },
  };

  const gateway = new PrayerRealtimeGateway(
    {} as never, // slotsService — unused by moderateChatMessage
    {} as never, // programsService
    tokenService as never,
    chatMessagesService as never,
    permissionsService as never,
    supabase as never,
    aiModerationService as never,
    notificationsService as never,
    pushNotificationsService as never,
    userMutesService as never,
  );

  return {
    gateway,
    chatMessagesService,
    aiModerationService,
    permissionsService,
    notificationsService,
    pushNotificationsService,
    userMutesService,
    tokenService,
    supabase,
  };
}

function fakeSocket(userId: string | null) {
  return {
    handshake: { query: { token: userId ? `token-for-${userId}` : '' } },
    emit: vi.fn(),
    join: vi.fn(),
    leave: vi.fn(),
  } as unknown as {
    handshake: { query: { token: string } };
    emit: ReturnType<typeof vi.fn>;
    join: ReturnType<typeof vi.fn>;
    leave: ReturnType<typeof vi.fn>;
  };
}

/** `this.server?.to(roomId).emit(...)` — a minimal fake capturing every broadcast emit call. */
function fakeServer() {
  const emit = vi.fn();
  const to = vi.fn(() => ({ emit }));
  return { server: { to } as unknown as never, emit };
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

  it('auto-mutes and notifies moderators once the repeat-flag threshold is crossed', async () => {
    const { gateway, userMutesService, notificationsService } = buildGateway({
      aiModerationService: {
        moderate: vi.fn().mockResolvedValue({ flagged: true, confidence: 0.5, reason: 'spam', critical: false }),
      },
      chatMessagesService: {
        flag: vi.fn().mockResolvedValue(undefined),
        hide: vi.fn().mockResolvedValue(undefined),
        countRecentFlagged: vi.fn().mockResolvedValue(3),
      },
      permissionsService: { listUserIdsWithAnyRole: vi.fn().mockResolvedValue(['moderator-1']) },
    });

    await moderate(gateway, 'world', MESSAGE, 'user-1');

    expect(userMutesService.mute).toHaveBeenCalledWith('user-1', null, 15, null, expect.any(String));
    expect(notificationsService.create).toHaveBeenCalledWith(
      'moderator-1',
      'AI_USER_AUTO_MUTED',
      { userId: 'user-1', mutedUntil: '2026-01-01T00:15:00.000Z' },
    );
  });

  it('does not auto-mute below the repeat-flag threshold', async () => {
    const { gateway, userMutesService } = buildGateway({
      aiModerationService: {
        moderate: vi.fn().mockResolvedValue({ flagged: true, confidence: 0.5, reason: 'spam', critical: false }),
      },
      chatMessagesService: {
        flag: vi.fn().mockResolvedValue(undefined),
        hide: vi.fn().mockResolvedValue(undefined),
        countRecentFlagged: vi.fn().mockResolvedValue(2),
      },
    });

    await moderate(gateway, 'world', MESSAGE, 'user-1');

    expect(userMutesService.mute).not.toHaveBeenCalled();
  });

  it('does not re-mute a user who already has an active mute', async () => {
    const { gateway, userMutesService, chatMessagesService } = buildGateway({
      aiModerationService: {
        moderate: vi.fn().mockResolvedValue({ flagged: true, confidence: 0.5, reason: 'spam', critical: false }),
      },
      userMutesService: {
        activeMuteUntil: vi.fn().mockResolvedValue('2026-01-01T00:15:00.000Z'),
        mute: vi.fn(),
        unmute: vi.fn(),
      },
    });

    await moderate(gateway, 'world', MESSAGE, 'user-1');

    expect(userMutesService.mute).not.toHaveBeenCalled();
    expect(chatMessagesService.countRecentFlagged).not.toHaveBeenCalled();
  });

  it('never throws when the auto-mute check itself fails', async () => {
    const { gateway } = buildGateway({
      aiModerationService: {
        moderate: vi.fn().mockResolvedValue({ flagged: true, confidence: 0.5, reason: 'spam', critical: false }),
      },
      userMutesService: {
        activeMuteUntil: vi.fn().mockRejectedValue(new Error('table missing')),
        mute: vi.fn(),
        unmute: vi.fn(),
      },
    });

    await expect(moderate(gateway, 'world', MESSAGE, 'user-1')).resolves.toBeUndefined();
  });
});

describe('PrayerRealtimeGateway.handleChatSend', () => {
  it('rejects with the mute expiry when the sender is currently muted', async () => {
    const { gateway, chatMessagesService } = buildGateway({
      tokenService: { verifyAccessToken: vi.fn().mockReturnValue({ sub: 'user-1' }) },
      permissionsService: {
        getUserPermissionCodes: vi.fn().mockResolvedValue(new Set(['room.chat.send'])),
        listUserIdsWithAnyRole: vi.fn().mockResolvedValue([]),
      },
      userMutesService: {
        activeMuteUntil: vi.fn().mockResolvedValue('2026-01-01T00:15:00.000Z'),
        mute: vi.fn(),
        unmute: vi.fn(),
      },
      chatMessagesService: { send: vi.fn(), flag: vi.fn(), hide: vi.fn(), countRecentFlagged: vi.fn() },
    });
    const client = fakeSocket('user-1');

    await gateway.handleChatSend(client as never, { roomId: 'world', content: 'Bonjour' });

    expect(client.emit).toHaveBeenCalledWith('chat:error', expect.objectContaining({ message: expect.stringContaining('sourdine') }));
    expect(chatMessagesService.send).not.toHaveBeenCalled();
  });

  it('still allows sending when the mute lookup itself fails (fail-open)', async () => {
    const { gateway, chatMessagesService } = buildGateway({
      tokenService: { verifyAccessToken: vi.fn().mockReturnValue({ sub: 'user-1' }) },
      permissionsService: {
        getUserPermissionCodes: vi.fn().mockResolvedValue(new Set(['room.chat.send'])),
        listUserIdsWithAnyRole: vi.fn().mockResolvedValue([]),
      },
      userMutesService: {
        activeMuteUntil: vi.fn().mockRejectedValue(new Error('table missing')),
        mute: vi.fn(),
        unmute: vi.fn(),
      },
      chatMessagesService: {
        send: vi.fn().mockResolvedValue(MESSAGE),
        flag: vi.fn(),
        hide: vi.fn(),
        countRecentFlagged: vi.fn().mockResolvedValue(0),
      },
      aiModerationService: { moderate: vi.fn().mockResolvedValue({ flagged: false, confidence: 0, reason: null, critical: false }) },
    });
    const client = fakeSocket('user-1');

    await gateway.handleChatSend(client as never, { roomId: 'world', content: 'Bonjour' });

    expect(chatMessagesService.send).toHaveBeenCalled();
  });
});

describe('PrayerRealtimeGateway.handleChatMute / handleChatUnmute', () => {
  it('rejects a mute attempt from a non-moderator', async () => {
    const { gateway, userMutesService } = buildGateway({
      tokenService: { verifyAccessToken: vi.fn().mockReturnValue({ sub: 'user-1' }) },
      permissionsService: { getUserPermissionCodes: vi.fn().mockResolvedValue(new Set<string>()) },
    });
    const client = fakeSocket('user-1');

    await gateway.handleChatMute(client as never, { roomId: 'world', userId: 'user-2' });

    expect(client.emit).toHaveBeenCalledWith('room:error', expect.objectContaining({ message: expect.any(String) }));
    expect(userMutesService.mute).not.toHaveBeenCalled();
  });

  it('mutes for the requested duration when the caller is a moderator', async () => {
    const { gateway, userMutesService } = buildGateway({
      tokenService: { verifyAccessToken: vi.fn().mockReturnValue({ sub: 'moderator-1' }) },
      permissionsService: { getUserPermissionCodes: vi.fn().mockResolvedValue(new Set(['room.moderate'])) },
    });
    const client = fakeSocket('moderator-1');

    await gateway.handleChatMute(client as never, { roomId: 'world', userId: 'user-2', minutes: 30, reason: 'spam' });

    expect(userMutesService.mute).toHaveBeenCalledWith('user-2', null, 30, 'moderator-1', 'spam');
  });

  it('clamps an out-of-range mute duration', async () => {
    const { gateway, userMutesService } = buildGateway({
      tokenService: { verifyAccessToken: vi.fn().mockReturnValue({ sub: 'moderator-1' }) },
      permissionsService: { getUserPermissionCodes: vi.fn().mockResolvedValue(new Set(['room.moderate'])) },
    });
    const client = fakeSocket('moderator-1');

    await gateway.handleChatMute(client as never, { roomId: 'world', userId: 'user-2', minutes: 999_999 });

    expect(userMutesService.mute).toHaveBeenCalledWith('user-2', null, 24 * 60, 'moderator-1', null);
  });

  it('unmutes only for a moderator', async () => {
    const { gateway, userMutesService } = buildGateway({
      tokenService: { verifyAccessToken: vi.fn().mockReturnValue({ sub: 'moderator-1' }) },
      permissionsService: { getUserPermissionCodes: vi.fn().mockResolvedValue(new Set(['room.moderate'])) },
    });
    const client = fakeSocket('moderator-1');

    await gateway.handleChatUnmute(client as never, { roomId: 'world', userId: 'user-2' });

    expect(userMutesService.unmute).toHaveBeenCalledWith('user-2', null);
  });
});

describe('PrayerRealtimeGateway — event chat & reactions', () => {
  it('joins the event room and sends back an empty history the first time', () => {
    const { gateway } = buildGateway();
    const client = fakeSocket(null);

    gateway.handleEventJoin(client as never, { eventId: 'event-1' });

    expect(client.join).toHaveBeenCalledWith('event:event-1');
    expect(client.emit).toHaveBeenCalledWith('event:chat:history', { eventId: 'event-1', messages: [] });
  });

  it('leaves the event room', () => {
    const { gateway } = buildGateway();
    const client = fakeSocket(null);

    gateway.handleEventLeave(client as never, { eventId: 'event-1' });

    expect(client.leave).toHaveBeenCalledWith('event:event-1');
  });

  it('rejects a chat message from an unauthenticated socket', async () => {
    const { gateway } = buildGateway();
    const client = fakeSocket(null);

    await gateway.handleEventChatSend(client as never, { eventId: 'event-1', content: 'Bonjour' });

    expect(client.emit).toHaveBeenCalledWith('event:chat:error', expect.objectContaining({ message: expect.any(String) }));
  });

  it('broadcasts a chat message and keeps it in the in-memory history for the next joiner', async () => {
    const { gateway } = buildGateway({ tokenService: { verifyAccessToken: vi.fn().mockReturnValue({ sub: 'user-1' }) } });
    (gateway as unknown as { server: unknown }).server = fakeServer().server;
    const sender = fakeSocket('user-1');

    await gateway.handleEventChatSend(sender as never, { eventId: 'event-1', content: 'Bonjour à tous' });

    const joiner = fakeSocket(null);
    gateway.handleEventJoin(joiner as never, { eventId: 'event-1' });

    expect(joiner.emit).toHaveBeenCalledWith(
      'event:chat:history',
      expect.objectContaining({
        eventId: 'event-1',
        messages: [expect.objectContaining({ authorId: 'user-1', content: 'Bonjour à tous' })],
      }),
    );
  });

  it('caps the in-memory history at 50 messages', async () => {
    const { gateway } = buildGateway({ tokenService: { verifyAccessToken: vi.fn().mockReturnValue({ sub: 'user-1' }) } });
    (gateway as unknown as { server: unknown }).server = fakeServer().server;
    const sender = fakeSocket('user-1');

    for (let i = 0; i < 55; i += 1) {
      await gateway.handleEventChatSend(sender as never, { eventId: 'event-cap', content: `message-${i}` });
    }

    const joiner = fakeSocket(null);
    gateway.handleEventJoin(joiner as never, { eventId: 'event-cap' });

    const call = joiner.emit.mock.calls.find(([event]: [string]) => event === 'event:chat:history');
    expect(call[1].messages).toHaveLength(50);
    expect(call[1].messages[0].content).toBe('message-5');
  });

  it('rejects a reaction from an unauthenticated socket', () => {
    const { gateway } = buildGateway();
    const client = fakeSocket(null);

    gateway.handleEventReactionSend(client as never, { eventId: 'event-1', emoji: '🙏' });

    expect(client.emit).toHaveBeenCalledWith('event:chat:error', expect.objectContaining({ message: expect.any(String) }));
  });

  it('broadcasts an allowed reaction to the event room', () => {
    const { gateway } = buildGateway({ tokenService: { verifyAccessToken: vi.fn().mockReturnValue({ sub: 'user-1' }) } });
    const { server, emit } = fakeServer();
    (gateway as unknown as { server: unknown }).server = server;
    const client = fakeSocket('user-1');

    gateway.handleEventReactionSend(client as never, { eventId: 'event-1', emoji: '🙏' });

    expect(emit).toHaveBeenCalledWith('event:reaction:new', { eventId: 'event-1', emoji: '🙏' });
  });

  it('falls back to the first allowed reaction for an unrecognized emoji', () => {
    const { gateway } = buildGateway({ tokenService: { verifyAccessToken: vi.fn().mockReturnValue({ sub: 'user-1' }) } });
    const { server, emit } = fakeServer();
    (gateway as unknown as { server: unknown }).server = server;
    const client = fakeSocket('user-1');

    gateway.handleEventReactionSend(client as never, { eventId: 'event-1', emoji: '💩' });

    expect(emit).toHaveBeenCalledWith('event:reaction:new', { eventId: 'event-1', emoji: '🙏' });
  });
});
