/**
 * Accounts created with a phone number instead of an e-mail. The users table keeps an e-mail
 * for every account (many flows rely on it), so a phone-only account gets a placeholder address
 * on the reserved ".invalid" domain (RFC 2606): it can never receive mail, is never shown, and
 * the e-mail service skips it.
 */
const PHONE_DOMAIN = '@telephone.tour-avant-garde.invalid';

/** "+228 90 00 00 00", "00228-90000000" → "+22890000000"; null if not an international number. */
export function normalizePhone(raw: string): string | null {
  let value = raw.trim().replace(/[\s.\-()/]/g, '');
  if (value.startsWith('00')) value = `+${value.slice(2)}`;
  return /^\+[1-9]\d{7,14}$/.test(value) ? value : null;
}

export function phoneAccountEmail(phone: string): string {
  return `${phone.replace(/^\+/, '')}${PHONE_DOMAIN}`;
}

export function isPhoneAccountEmail(email: string | null | undefined): boolean {
  return Boolean(email && email.toLowerCase().endsWith(PHONE_DOMAIN));
}

/** An identifier typed at login: an e-mail if it has an "@", otherwise a phone number. */
export function looksLikeEmail(identifier: string): boolean {
  return identifier.includes('@');
}
