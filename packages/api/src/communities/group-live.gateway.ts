import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { TokenService } from '../access/token.service';
import { PermissionsService } from '../access/permissions.service';
import { NotificationsService } from '../communication/notifications.service';
import { webOrigins } from '../common/web-origin';
import { SupabaseService } from '../supabase/supabase.service';
import { parseWorshipLink } from '../prayer/worship-music';
import { CommunitiesService } from './communities.service';
import { LIVE_KINDS, LiveKind, LiveVideo, newVisioLink, parseLiveVideo } from './group-live';

const COMMUNITY_MANAGE = 'community.manage';
const CHAT_HISTORY = 100;
const REACTIONS = ['🙏', '❤️', '🙌', '🔥', '👏', '✝️'];

export interface LiveSession {
  communityId: string;
  title: string;
  kind: LiveKind;
  host: { id: string; name: string };
  startedAt: string;
  video: LiveVideo | null;
  music: { embedUrl: string; provider: 'youtube' | 'spotify'; title: string } | null;
}

interface ChatEntry {
  id: string;
  userId: string;
  name: string;
  text: string;
  at: string;
}

type Payload = { communityId?: string } & Record<string, unknown>;

const room = (communityId: string) => `group-live:${communityId}`;

/**
 * Live rooms of churches and groups (namespace /live). Members of the group join; its leaders
 * (community.manage there) start, update and end the session, choose the video and the music.
 * Everyone present can chat, react and raise a hand. State lives in memory, like the prayer room.
 */
@WebSocketGateway({ namespace: '/live', cors: { origin: webOrigins() } })
export class GroupLiveGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(GroupLiveGateway.name);

  @WebSocketServer()
  server?: Server;

  private readonly sessions = new Map<string, LiveSession>();
  private readonly chats = new Map<string, ChatEntry[]>();
  private readonly hands = new Map<string, Map<string, string>>();
  /** socket id → { userId, name, communityId } for presence. */
  private readonly present = new Map<string, { userId: string; name: string; communityId: string }>();

  constructor(
    private readonly tokenService: TokenService,
    private readonly permissionsService: PermissionsService,
    private readonly communitiesService: CommunitiesService,
    private readonly notificationsService: NotificationsService,
    private readonly supabase: SupabaseService,
  ) {}

  handleConnection(client: Socket): void {
    if (!this.userOf(client)) client.disconnect(true);
  }

  handleDisconnect(client: Socket): void {
    const seat = this.present.get(client.id);
    if (!seat) return;
    this.present.delete(client.id);
    this.hands.get(seat.communityId)?.delete(seat.userId);
    this.broadcastPresence(seat.communityId);
  }

  /** Which groups are live now (badges on cards and pages). */
  liveSessions(): LiveSession[] {
    return [...this.sessions.values()];
  }

  getSession(communityId: string): LiveSession | null {
    return this.sessions.get(communityId) ?? null;
  }

  @SubscribeMessage('live:join')
  async join(@ConnectedSocket() client: Socket, @MessageBody() payload: Payload): Promise<void> {
    const access = await this.access(client, payload);
    if (!access) return;
    const { userId, communityId, canHost } = access;
    await client.join(room(communityId));
    this.present.set(client.id, { userId, communityId, name: await this.nameOf(userId) });
    client.emit('live:state', {
      session: this.sessions.get(communityId) ?? null,
      chat: this.chats.get(communityId) ?? [],
      hands: this.handsOf(communityId),
      canHost,
    });
    this.broadcastPresence(communityId);
  }

  @SubscribeMessage('live:leave')
  leave(@ConnectedSocket() client: Socket): void {
    this.handleDisconnect(client);
  }

  /** A leader opens (or updates) the session: title, kind, optional video link. */
  @SubscribeMessage('live:start')
  async start(@ConnectedSocket() client: Socket, @MessageBody() payload: Payload): Promise<void> {
    const access = await this.access(client, payload, true);
    if (!access) return;
    const { userId, communityId } = access;
    const title = String(payload.title ?? '').trim().slice(0, 150);
    if (!title) return this.fail(client, 'Donne un titre au direct.');
    const kind = (LIVE_KINDS as readonly string[]).includes(String(payload.kind)) ? (payload.kind as LiveKind) : 'INFORMATION';
    let video: LiveVideo | null = null;
    if (payload.newVisio) video = parseLiveVideo(newVisioLink(communityId));
    else if (payload.videoUrl) {
      video = parseLiveVideo(String(payload.videoUrl));
      if (!video) return this.fail(client, 'Lien vidéo non reconnu (il doit commencer par https://).');
    }
    const current = this.sessions.get(communityId);
    const session: LiveSession = {
      communityId,
      title,
      kind,
      host: current?.host ?? { id: userId, name: await this.nameOf(userId) },
      startedAt: current?.startedAt ?? new Date().toISOString(),
      video: video ?? (payload.keepVideo ? (current?.video ?? null) : null),
      music: current?.music ?? null,
    };
    this.sessions.set(communityId, session);
    this.server?.to(room(communityId)).emit('live:session', { session });
    if (!current) void this.notifyMembers(communityId, userId, session);
  }

  @SubscribeMessage('live:end')
  async end(@ConnectedSocket() client: Socket, @MessageBody() payload: Payload): Promise<void> {
    const access = await this.access(client, payload, true);
    if (!access) return;
    this.sessions.delete(access.communityId);
    this.hands.delete(access.communityId);
    this.server?.to(room(access.communityId)).emit('live:session', { session: null });
    this.server?.to(room(access.communityId)).emit('live:hands', { hands: [] });
  }

  /** Worship for everyone in the room: a YouTube or Spotify link, or nothing to stop. */
  @SubscribeMessage('live:music')
  async music(@ConnectedSocket() client: Socket, @MessageBody() payload: Payload): Promise<void> {
    const access = await this.access(client, payload, true);
    if (!access) return;
    const session = this.sessions.get(access.communityId);
    if (!session) return this.fail(client, "Démarre d'abord le direct.");
    if (!payload.link) {
      session.music = null;
    } else {
      const track = parseWorshipLink(String(payload.link));
      if (!track) return this.fail(client, 'Lien YouTube ou Spotify non reconnu.');
      session.music = { embedUrl: track.embedUrl, provider: track.provider, title: String(payload.title ?? '').slice(0, 120) || 'Louange' };
    }
    this.server?.to(room(access.communityId)).emit('live:session', { session });
  }

  @SubscribeMessage('live:chat')
  async chat(@ConnectedSocket() client: Socket, @MessageBody() payload: Payload): Promise<void> {
    const access = await this.access(client, payload);
    if (!access) return;
    const text = String(payload.text ?? '').trim().slice(0, 500);
    if (!text) return;
    const entry: ChatEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      userId: access.userId,
      name: this.present.get(client.id)?.name ?? (await this.nameOf(access.userId)),
      text,
      at: new Date().toISOString(),
    };
    const history = this.chats.get(access.communityId) ?? [];
    history.push(entry);
    this.chats.set(access.communityId, history.slice(-CHAT_HISTORY));
    this.server?.to(room(access.communityId)).emit('live:chat', { message: entry });
  }

  @SubscribeMessage('live:react')
  async react(@ConnectedSocket() client: Socket, @MessageBody() payload: Payload): Promise<void> {
    const access = await this.access(client, payload);
    if (!access || !REACTIONS.includes(String(payload.emoji))) return;
    this.server?.to(room(access.communityId)).emit('live:reaction', { emoji: payload.emoji });
  }

  /** Raise or lower one's hand (to ask a question, to speak). A leader may lower anyone's. */
  @SubscribeMessage('live:hand')
  async hand(@ConnectedSocket() client: Socket, @MessageBody() payload: Payload): Promise<void> {
    const access = await this.access(client, payload);
    if (!access) return;
    const hands = this.hands.get(access.communityId) ?? new Map<string, string>();
    const target = payload.userId && access.canHost ? String(payload.userId) : access.userId;
    if (hands.has(target)) hands.delete(target);
    else if (target === access.userId) hands.set(target, this.present.get(client.id)?.name ?? (await this.nameOf(target)));
    this.hands.set(access.communityId, hands);
    this.server?.to(room(access.communityId)).emit('live:hands', { hands: this.handsOf(access.communityId) });
  }

  // ---- helpers ----

  private userOf(client: Socket): string | undefined {
    const token = client.handshake.query.token;
    return typeof token === 'string' ? this.tokenService.verifyAccessToken(token)?.sub : undefined;
  }

  /** Members of the group may take part; its leaders may host. */
  private async access(
    client: Socket,
    payload: Payload,
    hostOnly = false,
  ): Promise<{ userId: string; communityId: string; canHost: boolean } | null> {
    const userId = this.userOf(client);
    const communityId = typeof payload?.communityId === 'string' ? payload.communityId : '';
    if (!userId || !/^[0-9a-f-]{36}$/i.test(communityId)) return null;
    try {
      const [status, permissions] = await Promise.all([
        this.communitiesService.getMembershipStatus(communityId, userId),
        this.permissionsService.getUserPermissionCodes(userId, communityId),
      ]);
      const canHost = permissions.has(COMMUNITY_MANAGE);
      if (hostOnly && !canHost) {
        this.fail(client, 'Seuls les responsables du groupe peuvent animer le direct.');
        return null;
      }
      if (status !== 'ACTIVE' && !canHost) {
        this.fail(client, 'Rejoins le groupe pour entrer dans sa salle.');
        return null;
      }
      return { userId, communityId, canHost };
    } catch (error) {
      this.logger.warn(`Live access check failed: ${(error as Error).message}`);
      return null;
    }
  }

  private fail(client: Socket, message: string): void {
    client.emit('live:error', { message });
  }

  private handsOf(communityId: string) {
    return [...(this.hands.get(communityId)?.entries() ?? [])].map(([userId, name]) => ({ userId, name }));
  }

  private broadcastPresence(communityId: string): void {
    const people = new Map<string, string>();
    for (const seat of this.present.values()) if (seat.communityId === communityId) people.set(seat.userId, seat.name);
    this.server
      ?.to(room(communityId))
      .emit('live:presence', { count: people.size, names: [...people.values()].slice(0, 30) });
  }

  private async nameOf(userId: string): Promise<string> {
    const { data } = await this.supabase.client.from('users').select('display_name').eq('id', userId).maybeSingle();
    return (data as { display_name: string } | null)?.display_name ?? 'Membre';
  }

  /** "Le direct commence" for every member of the group (but the host). */
  private async notifyMembers(communityId: string, hostId: string, session: LiveSession): Promise<void> {
    try {
      const members = await this.communitiesService.listMembers(communityId, { page: 1, limit: 500 } as never);
      for (const m of members.data) {
        if (m.user_id === hostId) continue;
        await this.notificationsService.create(m.user_id, 'GROUP_LIVE_STARTED', {
          communityId,
          title: session.title,
          kind: session.kind,
        });
      }
    } catch (error) {
      this.logger.warn(`Live notifications failed: ${(error as Error).message}`);
    }
  }
}
