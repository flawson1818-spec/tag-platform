/**
 * Switches for features paused on purpose. The e-mail / SMS validation code is paused for now
 * (owner's decision, 13/11/2026): no code is asked at sign-up. Turn it back on by building the
 * site with VITE_EMAIL_VERIFICATION=on (and EMAIL_VERIFICATION=on on the server).
 */
export const EMAIL_VERIFICATION_ON = import.meta.env.VITE_EMAIL_VERIFICATION === 'on';

/** A phone-only account carries a placeholder address that is never shown. */
export function isPhoneAccountEmail(email: string | null | undefined): boolean {
  return Boolean(email && email.toLowerCase().endsWith('@telephone.tour-avant-garde.invalid'));
}
