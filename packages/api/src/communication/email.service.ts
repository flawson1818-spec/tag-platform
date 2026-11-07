import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { Email } from './email.entity';
import { redact, SendOptions } from './redact';

const EMAIL_COLUMNS = 'id, user_id, to_email, subject, body, status, sent_at, created_at';

const BREVO_API = 'https://api.brevo.com/v3/smtp/email';
const SEND_TIMEOUT_MS = 10_000;

interface BrevoConfig {
  apiKey: string;
  fromEmail: string;
  fromName: string;
}

/** "ana.kouassi@gmail.com" → "an•••@gmail.com" — never log a full address. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '•••';
  return `${local.slice(0, 2)}•••@${domain}`;
}

/**
 * Transactional e-mail (verification, password reset, MFA codes, notifications).
 *
 * Sends through Brevo's REST API when BREVO_API_KEY and EMAIL_FROM are set (Brevo lets a single
 * verified sender address — a Gmail address works — send without owning a domain, 300 e-mails a
 * day on the free plan). Without them the message is only recorded, at status CREATED, so nothing
 * claims a send that never happened — same honesty rule as WhatsAppService.
 *
 * Every message is also recorded in `emails` for audit. Pass `options.secret` for a message
 * carrying a code or token: the provider gets the real text, the stored copy is redacted, and
 * neither the body nor the full address is ever logged.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly supabase: SupabaseService) {}

  private config(): BrevoConfig | null {
    const apiKey = process.env.BREVO_API_KEY?.trim();
    const fromEmail = process.env.EMAIL_FROM?.trim();
    if (!apiKey || !fromEmail) return null;
    return { apiKey, fromEmail, fromName: process.env.EMAIL_FROM_NAME?.trim() || "Tour d'avant-garde" };
  }

  isConfigured(): boolean {
    return this.config() !== null;
  }

  async send(toEmail: string, subject: string, body: string, userId?: string, options: SendOptions = {}): Promise<Email> {
    const delivered = await this.deliver(toEmail, subject, body);

    const { data, error } = await this.supabase.client
      .from('emails')
      .insert({
        user_id: userId ?? null,
        to_email: toEmail,
        subject,
        body: redact(body, options.secret),
        status: delivered === null ? 'CREATED' : delivered ? 'SENT' : 'FAILED',
        sent_at: delivered ? new Date().toISOString() : null,
      })
      .select(EMAIL_COLUMNS)
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return data as unknown as Email;
  }

  /** true sent, false failed, null no provider configured. Never throws: the caller's flow goes on. */
  private async deliver(toEmail: string, subject: string, body: string): Promise<boolean | null> {
    const config = this.config();
    if (!config) {
      this.logger.warn(`Email to ${maskEmail(toEmail)} recorded but NOT sent — no provider configured: ${subject}`);
      return null;
    }
    try {
      const res = await fetch(BREVO_API, {
        method: 'POST',
        headers: { 'api-key': config.apiKey, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          sender: { email: config.fromEmail, name: config.fromName },
          to: [{ email: toEmail }],
          subject,
          textContent: body,
        }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        this.logger.error(`Email to ${maskEmail(toEmail)} failed: ${res.status} ${detail.slice(0, 200)}`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.error(`Email to ${maskEmail(toEmail)} failed: ${(err as Error).message}`);
      return false;
    }
  }
}
