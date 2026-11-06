import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { FilesService } from '../storage/files.service';
import { SupabaseService } from '../supabase/supabase.service';
import { MessagesGateway } from './messages.gateway';

/** Postgres undefined table/column, or PostgREST's "not in schema cache". */
const MISSING_CODES = new Set(['42P01', '42703', 'PGRST204', 'PGRST205']);
const UNAVAILABLE = "La messagerie n'est pas encore activée sur ce serveur.";
const PAGE_SIZE = 50;

export interface MessagePeer {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface ConversationSummary {
  id: string;
  peer: MessagePeer;
  lastMessage: { content: string; createdAt: string; mine: boolean } | null;
  unread: number;
  /** I blocked them, or they blocked me: the thread is read-only. */
  blocked: boolean;
  blockedByMe: boolean;
}

export interface DirectMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: string;
}

interface ConversationRow {
  id: string;
  user_a: string;
  user_b: string;
  created_at: string;
  last_message_at: string | null;
  user_a_read_at: string | null;
  user_b_read_at: string | null;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

interface UserRow {
  id: string;
  display_name: string;
  avatar_file_id: string | null;
}

function toMessage(row: MessageRow): DirectMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    content: row.content,
    createdAt: row.created_at,
  };
}

/**
 * Private messages between two members — the Christian social network, step 2.
 *
 * One conversation per pair of members (stored with user_a < user_b). Messages go through the
 * API (so they are validated and stored first), then the gateway pushes them live to both
 * members' open tabs. A member can block another: no message gets through in either direction.
 */
@Injectable()
export class MessagesService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly filesService: FilesService,
    private readonly gateway: MessagesGateway,
  ) {}

  private get db() {
    return this.supabase.client;
  }

  private fail(error: { code?: string; message: string }): never {
    if (MISSING_CODES.has(error.code ?? '')) throw new ServiceUnavailableException(UNAVAILABLE);
    throw new InternalServerErrorException(error.message);
  }

  // ---- Conversations ----

  async listConversations(userId: string): Promise<ConversationSummary[]> {
    const { data, error } = await this.db
      .from('conversations')
      .select('id, user_a, user_b, created_at, last_message_at, user_a_read_at, user_b_read_at')
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)
      .not('last_message_at', 'is', null)
      .order('last_message_at', { ascending: false })
      .limit(100);
    // Before migration 20261108 there is simply no conversation yet.
    if (error) {
      if (MISSING_CODES.has(error.code ?? '')) return [];
      this.fail(error);
    }
    const rows = (data ?? []) as ConversationRow[];
    if (rows.length === 0) return [];
    return this.summarize(rows, userId);
  }

  /** Opens (or finds) my conversation with a member — from the "Envoyer un message" button. */
  async open(userId: string, memberId: string): Promise<ConversationSummary> {
    if (memberId === userId) throw new BadRequestException('Tu ne peux pas t’écrire à toi-même.');
    await this.findActiveUser(memberId);
    const [user_a, user_b] = userId < memberId ? [userId, memberId] : [memberId, userId];

    const { error: insertError } = await this.db
      .from('conversations')
      .upsert({ user_a, user_b }, { onConflict: 'user_a,user_b', ignoreDuplicates: true });
    if (insertError) this.fail(insertError);

    const { data, error } = await this.db
      .from('conversations')
      .select('id, user_a, user_b, created_at, last_message_at, user_a_read_at, user_b_read_at')
      .eq('user_a', user_a)
      .eq('user_b', user_b)
      .single();
    if (error) this.fail(error);
    const [summary] = await this.summarize([data as ConversationRow], userId);
    return summary;
  }

  async getConversation(userId: string, conversationId: string): Promise<ConversationSummary> {
    const row = await this.findMine(userId, conversationId);
    const [summary] = await this.summarize([row], userId);
    return summary;
  }

  // ---- Messages ----

  /** Newest page first in the query, returned oldest → newest for display. */
  async listMessages(userId: string, conversationId: string, before?: string): Promise<DirectMessage[]> {
    await this.findMine(userId, conversationId);
    let query = this.db
      .from('direct_messages')
      .select('id, conversation_id, sender_id, content, created_at')
      .eq('conversation_id', conversationId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);
    if (before) query = query.lt('created_at', before);
    const { data, error } = await query;
    if (error) this.fail(error);
    return ((data ?? []) as MessageRow[]).map(toMessage).reverse();
  }

  async send(userId: string, conversationId: string, content: string): Promise<DirectMessage> {
    const text = content.trim();
    if (!text) throw new BadRequestException('Le message est vide.');
    const conversation = await this.findMine(userId, conversationId);
    const peerId = conversation.user_a === userId ? conversation.user_b : conversation.user_a;
    const block = await this.blockState(userId, peerId);
    if (block.blockedByMe) throw new ForbiddenException('Tu as bloqué ce membre. Débloque-le pour lui écrire.');
    if (block.blockedMe) throw new ForbiddenException("Ce membre ne reçoit pas tes messages.");

    const { data, error } = await this.db
      .from('direct_messages')
      .insert({ conversation_id: conversationId, sender_id: userId, content: text })
      .select('id, conversation_id, sender_id, content, created_at')
      .single();
    if (error) this.fail(error);
    const message = toMessage(data as MessageRow);

    // Sending also means I've read everything up to my own message.
    const mySide = conversation.user_a === userId ? 'user_a_read_at' : 'user_b_read_at';
    await this.db
      .from('conversations')
      .update({ last_message_at: message.createdAt, [mySide]: message.createdAt })
      .eq('id', conversationId);

    this.gateway.emitMessage([userId, peerId], message);
    return message;
  }

  async markRead(userId: string, conversationId: string): Promise<{ ok: true }> {
    const conversation = await this.findMine(userId, conversationId);
    const mySide = conversation.user_a === userId ? 'user_a_read_at' : 'user_b_read_at';
    const { error } = await this.db
      .from('conversations')
      .update({ [mySide]: new Date().toISOString() })
      .eq('id', conversationId);
    if (error) this.fail(error);
    this.gateway.emitRead(userId, conversationId);
    return { ok: true };
  }

  async unreadTotal(userId: string): Promise<{ unread: number }> {
    const conversations = await this.listConversations(userId);
    return { unread: conversations.reduce((sum, c) => sum + c.unread, 0) };
  }

  // ---- Blocking ----

  async block(userId: string, memberId: string): Promise<{ blocked: true }> {
    if (memberId === userId) throw new BadRequestException('Tu ne peux pas te bloquer toi-même.');
    await this.findActiveUser(memberId, false);
    const { error } = await this.db
      .from('user_blocks')
      .upsert({ blocker_id: userId, blocked_id: memberId }, { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true });
    if (error) this.fail(error);
    return { blocked: true };
  }

  async unblock(userId: string, memberId: string): Promise<{ blocked: false }> {
    const { error } = await this.db.from('user_blocks').delete().eq('blocker_id', userId).eq('blocked_id', memberId);
    if (error) this.fail(error);
    return { blocked: false };
  }

  // ---- Helpers ----

  private async findMine(userId: string, conversationId: string): Promise<ConversationRow> {
    const { data, error } = await this.db
      .from('conversations')
      .select('id, user_a, user_b, created_at, last_message_at, user_a_read_at, user_b_read_at')
      .eq('id', conversationId)
      .maybeSingle();
    if (error) this.fail(error);
    const row = data as ConversationRow | null;
    // Someone else's conversation looks exactly like a missing one.
    if (!row || (row.user_a !== userId && row.user_b !== userId)) {
      throw new NotFoundException('Conversation introuvable.');
    }
    return row;
  }

  private async findActiveUser(id: string, mustBeActive = true): Promise<UserRow> {
    let query = this.db.from('users').select('id, display_name, avatar_file_id').eq('id', id).is('deleted_at', null);
    if (mustBeActive) query = query.eq('status', 'ACTIVE');
    const { data, error } = await query.maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException('Ce membre est introuvable.');
    return data as UserRow;
  }

  private async blockState(userId: string, peerId: string): Promise<{ blockedByMe: boolean; blockedMe: boolean }> {
    const { data, error } = await this.db
      .from('user_blocks')
      .select('blocker_id, blocked_id')
      .or(`and(blocker_id.eq.${userId},blocked_id.eq.${peerId}),and(blocker_id.eq.${peerId},blocked_id.eq.${userId})`);
    if (error) {
      if (MISSING_CODES.has(error.code ?? '')) return { blockedByMe: false, blockedMe: false };
      throw new InternalServerErrorException(error.message);
    }
    const rows = (data ?? []) as { blocker_id: string }[];
    return { blockedByMe: rows.some((r) => r.blocker_id === userId), blockedMe: rows.some((r) => r.blocker_id === peerId) };
  }

  /** Peer, last message, unread count and block state for each conversation — a fixed number of queries. */
  private async summarize(rows: ConversationRow[], userId: string): Promise<ConversationSummary[]> {
    const peerIds = rows.map((r) => (r.user_a === userId ? r.user_b : r.user_a));
    const ids = rows.map((r) => r.id);

    const [users, messages, blocks] = await Promise.all([
      this.db.from('users').select('id, display_name, avatar_file_id').in('id', peerIds),
      // Recent messages of these conversations: enough for previews and unread counts.
      this.db
        .from('direct_messages')
        .select('id, conversation_id, sender_id, content, created_at')
        .in('conversation_id', ids)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(Math.min(1000, 100 * ids.length)),
      this.db
        .from('user_blocks')
        .select('blocker_id, blocked_id')
        .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`),
    ]);
    if (users.error) throw new InternalServerErrorException(users.error.message);
    const userRows = (users.data ?? []) as UserRow[];
    const messageRows = (messages.error ? [] : (messages.data ?? [])) as MessageRow[];
    const blockRows = (blocks.error ? [] : (blocks.data ?? [])) as { blocker_id: string; blocked_id: string }[];
    const avatars = await this.filesService.getPublicReadUrls(userRows.map((u) => u.avatar_file_id ?? ''));

    return rows.map((row, i) => {
      const peerId = peerIds[i];
      const peer = userRows.find((u) => u.id === peerId);
      const readAt = row.user_a === userId ? row.user_a_read_at : row.user_b_read_at;
      const thread = messageRows.filter((m) => m.conversation_id === row.id);
      const last = thread[0];
      const blockedByMe = blockRows.some((b) => b.blocker_id === userId && b.blocked_id === peerId);
      const blockedMe = blockRows.some((b) => b.blocker_id === peerId && b.blocked_id === userId);
      return {
        id: row.id,
        peer: {
          id: peerId,
          displayName: peer?.display_name ?? 'Membre',
          avatarUrl: peer?.avatar_file_id ? (avatars.get(peer.avatar_file_id) ?? null) : null,
        },
        lastMessage: last ? { content: last.content, createdAt: last.created_at, mine: last.sender_id === userId } : null,
        unread: thread.filter((m) => m.sender_id !== userId && (!readAt || Date.parse(m.created_at) > Date.parse(readAt))).length,
        blocked: blockedByMe || blockedMe,
        blockedByMe,
      };
    });
  }
}
