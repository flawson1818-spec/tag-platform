import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { Email } from './email.entity';

const EMAIL_COLUMNS = 'id, user_id, to_email, subject, body, status, sent_at, created_at';

/**
 * Logs the send and records it in `emails` for audit/traceability. There is no real
 * transactional email provider wired up yet (Communication domain has no external
 * credentials configured) — swap this implementation for a provider-backed one without
 * touching callers, matching the "single-provider dependency" mitigation in
 * docs/09_ROADMAP_AND_BACKLOG.md section 4.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly supabase: SupabaseService) {}

  async send(toEmail: string, subject: string, body: string, userId?: string): Promise<Email> {
    this.logger.log(`Email to ${toEmail} — ${subject}`);

    const { data, error } = await this.supabase.client
      .from('emails')
      .insert({
        user_id: userId ?? null,
        to_email: toEmail,
        subject,
        body,
        status: 'SENT',
        sent_at: new Date().toISOString(),
      })
      .select(EMAIL_COLUMNS)
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return data as unknown as Email;
  }
}
