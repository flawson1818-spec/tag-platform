import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { WELCOME_SENDER_ID, welcomeText } from './welcome-message';

/** Puts the Christian welcome message in a new member's inbox. Best-effort: never blocks sign-up. */
@Injectable()
export class WelcomeService {
  private readonly logger = new Logger(WelcomeService.name);

  constructor(private readonly supabase: SupabaseService) {}

  async welcome(user: { id: string; display_name: string; locale?: string | null }): Promise<void> {
    try {
      if (user.id === WELCOME_SENDER_ID) return;
      const db = this.supabase.client;
      // Without the platform account (migration 20261121 not run yet) there is nobody to write from.
      const { data: sender } = await db.from('users').select('id').eq('id', WELCOME_SENDER_ID).maybeSingle();
      if (!sender) return;

      const [a, b] = WELCOME_SENDER_ID < user.id ? [WELCOME_SENDER_ID, user.id] : [user.id, WELCOME_SENDER_ID];
      const { data: existing } = await db.from('conversations').select('id').eq('user_a', a).eq('user_b', b).maybeSingle();
      if (existing) return;

      const now = new Date().toISOString();
      const mine = a === WELCOME_SENDER_ID ? 'user_a_read_at' : 'user_b_read_at';
      const { data: conversation, error } = await db
        .from('conversations')
        .insert({ user_a: a, user_b: b, last_message_at: now, [mine]: now })
        .select('id')
        .single();
      if (error || !conversation) return;
      await db.from('direct_messages').insert({
        conversation_id: (conversation as { id: string }).id,
        sender_id: WELCOME_SENDER_ID,
        content: welcomeText(user.locale, user.display_name),
      });
    } catch (error) {
      this.logger.warn(`Welcome message not sent: ${(error as Error).message}`);
    }
  }
}
