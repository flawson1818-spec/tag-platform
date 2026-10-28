/** What a stored copy shows instead of a one-time code or token. */
export const REDACTED = '[masqué]';

export interface SendOptions {
  /**
   * A secret the message carries (one-time code, reset or verification token). It reaches the
   * recipient, but the copy kept in the emails / whatsapp_messages audit tables has it replaced
   * by REDACTED, and it never appears in logs. Those tokens are stored hashed in their own tables
   * on purpose; a plaintext copy in an audit table would undo that.
   */
  secret?: string;
}

export function redact(body: string, secret?: string): string {
  return secret ? body.split(secret).join(REDACTED) : body;
}
