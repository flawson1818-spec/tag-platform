import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { ChatMessage } from './chat-message.entity';

const MESSAGE_COLUMNS =
  'id, community_id, author_id, content, status, created_at, author:author_id(display_name)';

type MessageRow = Omit<ChatMessage, 'author_display_name'> & { author: { display_name: string } | null };

function mapMessage(row: MessageRow): ChatMessage {
  const { author, ...rest } = row;
  return { ...rest, author_display_name: author?.display_name ?? null };
}

/** Room chat, scoped the same way as prayer rooms: community_id NULL is the world room. */
@Injectable()
export class ChatMessagesService {
  constructor(private readonly supabase: SupabaseService) {}

  private get db() {
    return this.supabase.client.from('chat_messages');
  }

  async send(communityId: string | null, authorId: string, content: string): Promise<ChatMessage> {
    const { data, error } = await this.db
      .insert({ community_id: communityId, author_id: authorId, content })
      .select(MESSAGE_COLUMNS)
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return mapMessage(data as unknown as MessageRow);
  }

  /** Most recent visible messages for a room, oldest first (ready to render top-to-bottom). */
  async listRecent(communityId: string | null, limit = 30): Promise<ChatMessage[]> {
    let query = this.db
      .select(MESSAGE_COLUMNS)
      .eq('status', 'VISIBLE')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(limit);
    query = communityId ? query.eq('community_id', communityId) : query.is('community_id', null);

    const { data, error } = await query;
    if (error) throw new InternalServerErrorException(error.message);
    return (data as unknown as MessageRow[]).map(mapMessage).reverse();
  }

  /** Moderator-only: hides a message from history without a hard delete (audit trail stays intact). */
  async hide(id: string): Promise<void> {
    const { error } = await this.db.update({ status: 'HIDDEN', deleted_at: new Date().toISOString() }).eq('id', id);
    if (error) throw new InternalServerErrorException(error.message);
  }

  /** Records an IA Modératrice content flag on a message that has already been sent. */
  async flag(id: string, reason: string | null, confidence: number): Promise<void> {
    const { error } = await this.db
      .update({ ai_flagged: true, ai_flag_reason: reason, ai_flag_confidence: confidence })
      .eq('id', id);
    if (error) throw new InternalServerErrorException(error.message);
  }
}
