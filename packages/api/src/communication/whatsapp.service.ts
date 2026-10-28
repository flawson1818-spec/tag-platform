import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { redact, SendOptions } from './redact';
import { maskPhone } from './sms.service';
import { WhatsAppMessage } from './whatsapp-message.entity';

const WHATSAPP_COLUMNS = 'id, user_id, to_phone, body, status, sent_at, created_at';

/**
 * Records the message in `whatsapp_messages` for audit/traceability. There is no WhatsApp
 * Business API account configured yet (see docs/03_ARCHITECTURE_SPECIFICATION.md's "WhatsApp
 * Business API" external system, and docs/09_ROADMAP_AND_BACKLOG.md's push+WhatsApp backlog
 * item) — this deliberately leaves the row at status 'CREATED' rather than claiming a send that
 * never happened. Swap the body of send() for a provider-backed call (Twilio/Meta Cloud API)
 * without touching callers once credentials exist; the row would then progress through
 * QUEUED → SENDING → DELIVERED → READ per docs/10_STATE_MACHINES.md's WHATSAPP lifecycle.
 */
@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  constructor(private readonly supabase: SupabaseService) {}

  /** Pass `options.secret` for a message carrying a code: the stored copy is redacted. */
  async send(toPhone: string, body: string, userId?: string, options: SendOptions = {}): Promise<WhatsAppMessage> {
    // Never the body: for MFA it is the code itself.
    this.logger.warn(`WhatsApp message to ${maskPhone(toPhone)} recorded but NOT sent — no provider configured`);

    const { data, error } = await this.supabase.client
      .from('whatsapp_messages')
      .insert({ user_id: userId ?? null, to_phone: toPhone, body: redact(body, options.secret), status: 'CREATED' })
      .select(WHATSAPP_COLUMNS)
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return data as unknown as WhatsAppMessage;
  }
}
