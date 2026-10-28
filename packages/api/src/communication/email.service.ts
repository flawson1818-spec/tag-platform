import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { Email } from './email.entity';
import { redact, SendOptions } from './redact';

const EMAIL_COLUMNS = 'id, user_id, to_email, subject, body, status, sent_at, created_at';

/**
 * Records the message in `emails` for audit/traceability. There is no real transactional email
 * provider wired up yet (Communication domain has no external credentials configured), so the
 * row stays at status CREATED rather than claiming a send that never happened — same honesty
 * rule as WhatsAppService. Swap this implementation for a provider-backed one without touching
 * callers, matching the "single-provider dependency" mitigation in
 * docs/09_ROADMAP_AND_BACKLOG.md section 4.
 *
 * Pass `options.secret` for a message carrying a code or token: the stored copy is redacted.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly supabase: SupabaseService) {}

  async send(toEmail: string, subject: string, body: string, userId?: string, options: SendOptions = {}): Promise<Email> {
    this.logger.warn(`Email to ${toEmail} recorded but NOT sent — no provider configured: ${subject}`);

    const { data, error } = await this.supabase.client
      .from('emails')
      .insert({
        user_id: userId ?? null,
        to_email: toEmail,
        subject,
        body: redact(body, options.secret),
        status: 'CREATED',
        sent_at: null,
      })
      .select(EMAIL_COLUMNS)
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return data as unknown as Email;
  }
}
