import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { PermissionsService } from '../access/permissions.service';
import { TokenService } from '../access/token.service';
import { SupabaseService } from '../supabase/supabase.service';
import { AiModerationService } from '../ai/ai-moderation.service';
import { NotificationsService } from '../communication/notifications.service';
import { PushNotificationsService } from '../communication/push-notifications.service';
import { ChatMessagesService } from './chat-messages.service';
import { ChatMessage } from './chat-message.entity';
import { PrayerSlotsService } from './prayer-slots.service';
import { PrayerProgramsService } from './prayer-programs.service';
import { fromRoomId } from './prayer-constants';
import { PrayerSlot } from './prayer-slot.entity';

interface RoomJoinPayload {
  roomId: string;
}

interface ChatSendPayload {
  roomId: string;
  content: string;
}

interface ChatHidePayload {
  roomId: string;
  messageId: string;
}

interface ReactionSendPayload {
  roomId: string;
  emoji: string;
}

interface SpeakGrantPayload {
  roomId: string;
  userId: string;
}

interface MusicPlayPayload {
  roomId: string;
  videoId: string;
  title?: string;
}

const CHAT_SEND_PERMISSION = 'room.chat.send';
const CHAT_MODERATE_PERMISSION = 'room.moderate';
const CHAT_MAX_LENGTH = 500;
const CRITICAL_FLAG_RECIPIENT_ROLES = ['MODERATEUR', 'RESPONSABLE_EQUIPE', 'PASTEUR', 'ADMINISTRATEUR', 'SUPER_ADMINISTRATEUR'];
const ALLOWED_REACTIONS = ['🙏', '❤️', '🙌', '✨', '🔥', '😢'];
const YOUTUBE_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

function extractUserId(client: Socket, tokenService: TokenService): string | null {
  const token = client.handshake.query.token;
  if (typeof token !== 'string') return null;
  return tokenService.verifyAccessToken(token)?.sub ?? null;
}

/**
 * Real-time contract from docs/05_API_SPECIFICATION.md section 11: room:join, slot:started,
 * slot:tick, slot:ended let a read-only client display the current room. chat:send/chat:message/
 * chat:history/chat:hide add room chat; hand:raise/hand:lower, reaction:send, and
 * speak:request/grant/revoke add the rest of the in-room interactions from
 * docs/01_FUNCTIONAL_SPECIFICATION.md section 4 (lever la main, réagir, prendre la parole).
 * Hand-raise/speaker state is kept in memory per gateway instance — it's presence, not a
 * durable record, and doesn't need to survive a restart the way chat history does.
 * speak:grant/revoke only flip who is marked as the floor-holder; no audio transport is wired
 * up yet (see docs/03_ARCHITECTURE_SPECIFICATION.md section 8 — WebRTC SFU is a separate piece
 * of work). A token on the handshake (`?token=<accessToken>`) is optional — anonymous read-only
 * viewing is intentional (docs/01_FUNCTIONAL_SPECIFICATION.md: Visiteur reads salles publiques).
 */
@WebSocketGateway({ namespace: '/realtime', cors: { origin: process.env.WEB_ORIGIN || 'http://localhost:4200' } })
export class PrayerRealtimeGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(PrayerRealtimeGateway.name);

  private readonly raisedHands = new Map<string, Map<string, string>>(); // roomId -> userId -> displayName
  private readonly pendingSpeakers = new Map<string, Map<string, string>>();
  private readonly activeSpeakers = new Map<string, Map<string, string>>();
  private readonly nowPlaying = new Map<string, { videoId: string; title: string }>();

  constructor(
    private readonly slotsService: PrayerSlotsService,
    private readonly programsService: PrayerProgramsService,
    private readonly tokenService: TokenService,
    private readonly chatMessagesService: ChatMessagesService,
    private readonly permissionsService: PermissionsService,
    private readonly supabase: SupabaseService,
    private readonly aiModerationService: AiModerationService,
    private readonly notificationsService: NotificationsService,
    private readonly pushNotificationsService: PushNotificationsService,
  ) {}

  @SubscribeMessage('room:join')
  async handleJoin(@ConnectedSocket() client: Socket, @MessageBody() payload: RoomJoinPayload): Promise<void> {
    if (!payload?.roomId) return;
    client.join(payload.roomId);

    const history = await this.chatMessagesService.listRecent(fromRoomId(payload.roomId));
    client.emit('chat:history', { roomId: payload.roomId, messages: history });

    const raised = Array.from(this.raisedHands.get(payload.roomId)?.entries() ?? []).map(([userId, displayName]) => ({
      userId,
      displayName,
    }));
    client.emit('hand:update', { roomId: payload.roomId, raised });

    const pending = Array.from(this.pendingSpeakers.get(payload.roomId)?.entries() ?? []).map(([userId, displayName]) => ({
      userId,
      displayName,
    }));
    const active = Array.from(this.activeSpeakers.get(payload.roomId)?.entries() ?? []).map(([userId, displayName]) => ({
      userId,
      displayName,
    }));
    client.emit('speak:update', { roomId: payload.roomId, pending, active });

    const playing = this.nowPlaying.get(payload.roomId);
    client.emit('music:update', playing ? { roomId: payload.roomId, playing: true, ...playing } : { roomId: payload.roomId, playing: false });

    const program = await this.programsService.findActiveByCommunity(fromRoomId(payload.roomId));
    if (!program) return;
    const slot = await this.slotsService.findRunningSlotByProgram(program.id);
    if (!slot) return;

    const userId = extractUserId(client, this.tokenService);
    if (userId) await this.slotsService.recordAttendance(slot.id, userId);

    const remainingSeconds = Math.max(0, Math.round((new Date(slot.end_at).getTime() - Date.now()) / 1000));
    client.emit('slot:started', { roomId: payload.roomId, slot, remainingSeconds });
  }

  @SubscribeMessage('room:leave')
  handleLeave(@ConnectedSocket() client: Socket, @MessageBody() payload: RoomJoinPayload): void {
    if (payload?.roomId) client.leave(payload.roomId);
  }

  @SubscribeMessage('chat:send')
  async handleChatSend(@ConnectedSocket() client: Socket, @MessageBody() payload: ChatSendPayload): Promise<void> {
    if (!payload?.roomId || !payload?.content?.trim()) return;

    const userId = extractUserId(client, this.tokenService);
    if (!userId) {
      client.emit('chat:error', { message: 'Connexion requise pour écrire dans le chat.' });
      return;
    }

    const communityId = fromRoomId(payload.roomId);
    const permissions = await this.permissionsService.getUserPermissionCodes(userId, communityId ?? undefined);
    if (!permissions.has(CHAT_SEND_PERMISSION)) {
      client.emit('chat:error', { message: 'Ton rôle actuel ne permet pas encore d\'écrire dans le chat.' });
      return;
    }

    const content = payload.content.trim().slice(0, CHAT_MAX_LENGTH);
    const message = await this.chatMessagesService.send(communityId, userId, content);
    this.server?.to(payload.roomId).emit('chat:message', { roomId: payload.roomId, message });
    void this.moderateChatMessage(payload.roomId, message, userId);
  }

  /**
   * Runs after the message is already broadcast — a Claude round-trip is too slow to gate a
   * live chat send on (docs/02_AI_AGENTS_SPECIFICATION.md section 5). Only a "critical" flag
   * (manifestly illegal/dangerous content) triggers the automatic quarantine the spec allows;
   * everything else is just recorded for a human moderator to review.
   */
  private async moderateChatMessage(roomId: string, message: ChatMessage, authorId: string): Promise<void> {
    const result = await this.aiModerationService.moderate(message.content, authorId);
    if (!result.flagged) return;

    await this.chatMessagesService.flag(message.id, result.reason, result.confidence);
    if (result.critical) {
      await this.chatMessagesService.hide(message.id);
      this.server?.to(roomId).emit('chat:messageHidden', { roomId, messageId: message.id });
      await this.notifyCriticalFlag(message.id, authorId);
    }
  }

  /**
   * docs/02_AI_AGENTS_SPECIFICATION.md section 5: a critical auto-quarantine must come "avec
   * notification immédiate à un modérateur humain" — the message was already being auto-hidden,
   * but nobody was ever actually told. Best-effort: never lets a notification failure surface
   * back to the chat flow, which has already completed by the time this runs.
   */
  private async notifyCriticalFlag(messageId: string, authorId: string): Promise<void> {
    let recipientIds: string[];
    try {
      recipientIds = await this.permissionsService.listUserIdsWithAnyRole(CRITICAL_FLAG_RECIPIENT_ROLES);
    } catch (error) {
      this.logger.error('Failed to look up critical-flag recipients', error as Error);
      return;
    }

    const title = 'Alerte IA Modératrice — contenu critique mis en quarantaine';
    const body =
      'Un message de chat a été automatiquement masqué (contenu manifestement illégal ou ' +
      'dangereux) — une revue humaine est requise dès que possible.';

    await Promise.all(
      recipientIds.map(async (recipientId) => {
        await this.notificationsService
          .create(recipientId, 'AI_CRITICAL_CONTENT_FLAGGED', { messageId, authorId })
          .catch((error) => this.logger.error(`Failed to notify ${recipientId} of a critical flag`, error));
        await this.pushNotificationsService
          .send(recipientId, title, body)
          .catch((error) => this.logger.error(`Failed to push-notify ${recipientId} of a critical flag`, error));
      }),
    );
  }

  @SubscribeMessage('chat:hide')
  async handleChatHide(@ConnectedSocket() client: Socket, @MessageBody() payload: ChatHidePayload): Promise<void> {
    if (!payload?.roomId || !payload?.messageId) return;

    const userId = extractUserId(client, this.tokenService);
    if (!userId) return;

    const communityId = fromRoomId(payload.roomId);
    const permissions = await this.permissionsService.getUserPermissionCodes(userId, communityId ?? undefined);
    if (!permissions.has(CHAT_MODERATE_PERMISSION)) {
      client.emit('room:error', { message: 'Action réservée aux modérateurs.' });
      return;
    }

    await this.chatMessagesService.hide(payload.messageId);
    this.server?.to(payload.roomId).emit('chat:messageHidden', { roomId: payload.roomId, messageId: payload.messageId });
  }

  @SubscribeMessage('hand:raise')
  async handleHandRaise(@ConnectedSocket() client: Socket, @MessageBody() payload: RoomJoinPayload): Promise<void> {
    if (!payload?.roomId) return;
    const userId = extractUserId(client, this.tokenService);
    if (!userId) {
      client.emit('room:error', { message: 'Connexion requise pour lever la main.' });
      return;
    }
    this.roomMap(this.raisedHands, payload.roomId).set(userId, await this.displayNameFor(userId));
    this.broadcastHandUpdate(payload.roomId);
  }

  @SubscribeMessage('hand:lower')
  handleHandLower(@ConnectedSocket() client: Socket, @MessageBody() payload: RoomJoinPayload): void {
    if (!payload?.roomId) return;
    const userId = extractUserId(client, this.tokenService);
    if (!userId) return;
    this.raisedHands.get(payload.roomId)?.delete(userId);
    this.broadcastHandUpdate(payload.roomId);
  }

  @SubscribeMessage('reaction:send')
  handleReactionSend(@ConnectedSocket() client: Socket, @MessageBody() payload: ReactionSendPayload): void {
    if (!payload?.roomId) return;
    const userId = extractUserId(client, this.tokenService);
    if (!userId) {
      client.emit('room:error', { message: 'Connexion requise pour réagir.' });
      return;
    }
    const emoji = ALLOWED_REACTIONS.includes(payload.emoji) ? payload.emoji : ALLOWED_REACTIONS[0];
    this.server?.to(payload.roomId).emit('reaction:new', { roomId: payload.roomId, emoji });
  }

  @SubscribeMessage('speak:request')
  async handleSpeakRequest(@ConnectedSocket() client: Socket, @MessageBody() payload: RoomJoinPayload): Promise<void> {
    if (!payload?.roomId) return;
    const userId = extractUserId(client, this.tokenService);
    if (!userId) {
      client.emit('room:error', { message: 'Connexion requise pour demander la parole.' });
      return;
    }
    this.roomMap(this.pendingSpeakers, payload.roomId).set(userId, await this.displayNameFor(userId));
    this.broadcastSpeakUpdate(payload.roomId);
  }

  @SubscribeMessage('speak:cancel')
  handleSpeakCancel(@ConnectedSocket() client: Socket, @MessageBody() payload: RoomJoinPayload): void {
    if (!payload?.roomId) return;
    const userId = extractUserId(client, this.tokenService);
    if (!userId) return;
    this.pendingSpeakers.get(payload.roomId)?.delete(userId);
    this.broadcastSpeakUpdate(payload.roomId);
  }

  /** Moderator-only: moves a requester from pending to active speaker. No audio transport yet. */
  @SubscribeMessage('speak:grant')
  async handleSpeakGrant(@ConnectedSocket() client: Socket, @MessageBody() payload: SpeakGrantPayload): Promise<void> {
    if (!payload?.roomId || !payload?.userId) return;
    if (!(await this.isModerator(client, payload.roomId))) {
      client.emit('room:error', { message: 'Action réservée aux modérateurs.' });
      return;
    }

    const pending = this.pendingSpeakers.get(payload.roomId);
    const displayName = pending?.get(payload.userId) ?? (await this.displayNameFor(payload.userId));
    pending?.delete(payload.userId);
    this.roomMap(this.activeSpeakers, payload.roomId).set(payload.userId, displayName);
    this.broadcastSpeakUpdate(payload.roomId);
  }

  @SubscribeMessage('speak:revoke')
  async handleSpeakRevoke(@ConnectedSocket() client: Socket, @MessageBody() payload: SpeakGrantPayload): Promise<void> {
    if (!payload?.roomId || !payload?.userId) return;
    if (!(await this.isModerator(client, payload.roomId))) {
      client.emit('room:error', { message: 'Action réservée aux modérateurs.' });
      return;
    }

    this.activeSpeakers.get(payload.roomId)?.delete(payload.userId);
    this.broadcastSpeakUpdate(payload.roomId);
  }

  /**
   * Moderator-only: sets the room's shared "now playing" YouTube video, rendered as an
   * official YouTube embed on every connected client (docs request: let people listen inside
   * the room instead of only linking out to search results). No audio is hosted or proxied by
   * this app — it's YouTube's own embeddable player, just kept in sync room-wide.
   */
  @SubscribeMessage('music:play')
  async handleMusicPlay(@ConnectedSocket() client: Socket, @MessageBody() payload: MusicPlayPayload): Promise<void> {
    if (!payload?.roomId || !YOUTUBE_ID_PATTERN.test(payload.videoId ?? '')) return;
    if (!(await this.isModerator(client, payload.roomId))) {
      client.emit('room:error', { message: 'Action réservée aux modérateurs.' });
      return;
    }
    const state = { videoId: payload.videoId, title: (payload.title ?? '').trim().slice(0, 120) || 'Musique d\'adoration' };
    this.nowPlaying.set(payload.roomId, state);
    this.server?.to(payload.roomId).emit('music:update', { roomId: payload.roomId, playing: true, ...state });
  }

  @SubscribeMessage('music:stop')
  async handleMusicStop(@ConnectedSocket() client: Socket, @MessageBody() payload: RoomJoinPayload): Promise<void> {
    if (!payload?.roomId) return;
    if (!(await this.isModerator(client, payload.roomId))) {
      client.emit('room:error', { message: 'Action réservée aux modérateurs.' });
      return;
    }
    this.nowPlaying.delete(payload.roomId);
    this.server?.to(payload.roomId).emit('music:update', { roomId: payload.roomId, playing: false });
  }

  handleDisconnect(client: Socket): void {
    const userId = extractUserId(client, this.tokenService);
    if (!userId) return;
    for (const roomId of this.raisedHands.keys()) {
      if (this.raisedHands.get(roomId)?.delete(userId)) this.broadcastHandUpdate(roomId);
    }
    for (const roomId of this.pendingSpeakers.keys()) {
      if (this.pendingSpeakers.get(roomId)?.delete(userId)) this.broadcastSpeakUpdate(roomId);
    }
  }

  private async isModerator(client: Socket, roomId: string): Promise<boolean> {
    const userId = extractUserId(client, this.tokenService);
    if (!userId) return false;
    const communityId = fromRoomId(roomId);
    const permissions = await this.permissionsService.getUserPermissionCodes(userId, communityId ?? undefined);
    return permissions.has(CHAT_MODERATE_PERMISSION);
  }

  private async displayNameFor(userId: string): Promise<string> {
    const { data } = await this.supabase.client.from('users').select('display_name').eq('id', userId).maybeSingle();
    return (data as { display_name: string } | null)?.display_name ?? 'Anonyme';
  }

  private roomMap<T>(store: Map<string, Map<string, T>>, roomId: string): Map<string, T> {
    let map = store.get(roomId);
    if (!map) {
      map = new Map<string, T>();
      store.set(roomId, map);
    }
    return map;
  }

  private broadcastHandUpdate(roomId: string): void {
    const raised = Array.from(this.raisedHands.get(roomId)?.entries() ?? []).map(([userId, displayName]) => ({
      userId,
      displayName,
    }));
    this.server?.to(roomId).emit('hand:update', { roomId, raised });
  }

  private broadcastSpeakUpdate(roomId: string): void {
    const pending = Array.from(this.pendingSpeakers.get(roomId)?.entries() ?? []).map(([userId, displayName]) => ({
      userId,
      displayName,
    }));
    const active = Array.from(this.activeSpeakers.get(roomId)?.entries() ?? []).map(([userId, displayName]) => ({
      userId,
      displayName,
    }));
    this.server?.to(roomId).emit('speak:update', { roomId, pending, active });
  }

  emitSlotStarted(roomId: string, slot: PrayerSlot, remainingSeconds: number): void {
    this.server?.to(roomId).emit('slot:started', { roomId, slot, remainingSeconds });
  }

  emitSlotTick(roomId: string, remainingSeconds: number): void {
    this.server?.to(roomId).emit('slot:tick', { roomId, remainingSeconds });
  }

  emitSlotEnded(roomId: string, slotId: string): void {
    this.server?.to(roomId).emit('slot:ended', { roomId, slotId });
  }

  /**
   * Engine-only, called right after emitSlotEnded (docs/07_UX_UI_SPECIFICATION.md §3 cas
   * d'erreur: a slot ending mid-speech must be a "coupure douce", not a silent carry-over —
   * without this, activeSpeakers is untouched by slot transitions and someone granted the
   * floor for one topic would stay marked as speaking into every topic after it, forever).
   * Broadcasts the now-empty speaker list plus a distinct event naming who lost the floor, so
   * only those specific clients show "Vous avez été remis en écoute" instead of everyone.
   */
  clearActiveSpeakers(roomId: string): string[] {
    const active = this.activeSpeakers.get(roomId);
    if (!active || active.size === 0) return [];
    const revokedUserIds = Array.from(active.keys());
    active.clear();
    this.broadcastSpeakUpdate(roomId);
    this.server?.to(roomId).emit('speak:revoked', { roomId, userIds: revokedUserIds });
    return revokedUserIds;
  }
}
