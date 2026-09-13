/**
 * docs/12_SECURITY_SPECIFICATION.md PASSWORD POLICY "Blacklist". The complexity regex
 * (PASSWORD_POLICY_REGEX) already rejects most trivially weak passwords (no uppercase/digit/
 * special char), so this list only needs to cover common passwords that still satisfy that
 * complexity rule on paper — keyboard-walk and "common word + 123!" patterns.
 */
const PASSWORD_BLACKLIST = new Set(
  [
    'Password123!',
    'Password1!',
    'Welcome123!',
    'Welcome1!',
    'Qwerty123!',
    'Qwerty1234!',
    'Admin123!',
    'Admin1234!',
    'Letmein123!',
    'Iloveyou123!',
    'Sunshine123!',
    'Dragon123!',
    'Monkey123!',
    'Football123!',
    'Baseball123!',
    'Trustno1!',
    'Passw0rd!',
    'P@ssw0rd!',
    'Abcd1234!',
    'Changeme123!',
  ].map((p) => p.toLowerCase()),
);

export function isBlacklistedPassword(plain: string): boolean {
  return PASSWORD_BLACKLIST.has(plain.toLowerCase());
}
