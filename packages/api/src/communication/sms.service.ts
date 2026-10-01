import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

const TWILIO_API = 'https://api.twilio.com/2010-04-01';
const SEND_TIMEOUT_MS = 10_000;
/** E.164: "+" then 7 to 15 digits, no leading zero (ex : +2250701020304). */
export const E164_PATTERN = /^\+[1-9]\d{6,14}$/;

/** "+225 07 01-02.03 (04)" → "+2250701020304"; null when it isn't an international number. */
export function toE164(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const compact = phone.replace(/[\s\-.()]/g, '');
  return E164_PATTERN.test(compact) ? compact : null;
}

interface TwilioConfig {
  accountSid: string;
  authToken: string;
  from?: string;
  messagingServiceSid?: string;
}

/** "+2250701020304" → "+225•••••0304" — never log a full phone number. */
export function maskPhone(phone: string): string {
  return phone.length <= 6 ? '••••' : `${phone.slice(0, 4)}${'•'.repeat(Math.max(0, phone.length - 8))}${phone.slice(-4)}`;
}

/**
 * docs/12_SECURITY_SPECIFICATION.md MFA "SMS OTP". Twilio Programmable Messaging over its plain
 * REST API (no SDK dependency). Disabled until TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN and either
 * TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID are set — isConfigured() lets callers offer
 * SMS only when it can really be delivered, instead of pretending like a log-only channel.
 *
 * The message body is never logged: for MFA it *is* the secret.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  private config(): TwilioConfig | null {
    const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
    const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
    const from = process.env.TWILIO_FROM_NUMBER?.trim() || undefined;
    const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim() || undefined;
    if (!accountSid || !authToken || (!from && !messagingServiceSid)) return null;
    return { accountSid, authToken, from, messagingServiceSid };
  }

  isConfigured(): boolean {
    return this.config() !== null;
  }

  async send(toPhone: string, body: string): Promise<void> {
    const config = this.config();
    if (!config) throw new ServiceUnavailableException("L'envoi de SMS n'est pas configuré sur ce serveur.");

    const form = new URLSearchParams({ To: toPhone, Body: body });
    if (config.messagingServiceSid) form.set('MessagingServiceSid', config.messagingServiceSid);
    else form.set('From', config.from as string);

    let response: Response;
    try {
      response = await fetch(`${TWILIO_API}/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.error(`SMS to ${maskPhone(toPhone)} failed: ${(error as Error).message}`);
      throw new ServiceUnavailableException("Le SMS n'a pas pu être envoyé. Réessaie ou choisis un autre moyen.");
    }

    if (!response.ok) {
      // Twilio's error JSON carries a code/message, never the body we sent.
      const detail = await response.text().catch(() => '');
      this.logger.error(`SMS to ${maskPhone(toPhone)} rejected (${response.status}): ${detail.slice(0, 300)}`);
      throw new ServiceUnavailableException("Le SMS n'a pas pu être envoyé. Réessaie ou choisis un autre moyen.");
    }
    this.logger.log(`SMS sent to ${maskPhone(toPhone)}`);
  }
}
