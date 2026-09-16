/**
 * docs/12_SECURITY_SPECIFICATION.md PASSWORD POLICY "Blacklist". Since PASSWORD_POLICY_REGEX
 * dropped mandatory character-class composition (see password-policy.ts) in favor of a length
 * floor, this list is now the *primary* defense against common/breached passwords — not just a
 * backstop for complexity-rule-satisfying variants — so it covers plain common passwords too,
 * not only "Word123!"-shaped ones.
 */
const PASSWORD_BLACKLIST = new Set(
  [
    'password', 'password1', 'password123', 'Password123!', 'Password1!',
    '12345678', '123456789', '1234567890', 'qwertyui', 'qwerty123', 'Qwerty123!', 'Qwerty1234!',
    'welcome1', 'welcome123', 'Welcome123!', 'Welcome1!',
    'admin123', 'administrator', 'Admin123!', 'Admin1234!',
    'letmein1', 'letmein123', 'Letmein123!',
    'iloveyou', 'iloveyou1', 'Iloveyou123!',
    'sunshine', 'sunshine1', 'Sunshine123!',
    'dragon123', 'Dragon123!',
    'monkey123', 'Monkey123!',
    'football', 'football1', 'Football123!',
    'baseball', 'baseball1', 'Baseball123!',
    'trustno1', 'Trustno1!',
    'passw0rd', 'Passw0rd!', 'P@ssw0rd!',
    'abcd1234', 'Abcd1234!',
    'changeme', 'changeme1', 'Changeme123!',
    'jesus123', 'jesus2024', 'jesus2025', 'jesus2026', 'christ123', 'godislove', 'hallelujah',
    'blessed1', 'amen1234',
    '11111111', '00000000', 'aaaaaaaa',
  ].map((p) => p.toLowerCase()),
);

export function isBlacklistedPassword(plain: string): boolean {
  return PASSWORD_BLACKLIST.has(plain.toLowerCase());
}
