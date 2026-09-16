/**
 * Length-only, no forced character-class composition — see docs/12_SECURITY_SPECIFICATION.md.
 * TAG is a devotional platform used by people at every level of comfort with technology, and
 * mandatory "1 uppercase + 1 digit + 1 special char" rules are exactly the kind of signup
 * friction that pushes people away, without the security benefit they seem to promise: NIST
 * 800-63B has recommended length over composition since 2017, because composition rules just
 * train users toward predictable patterns ("Password1!"). Real defense against weak passwords
 * now comes from the blacklist (password-blacklist.ts) and Argon2id, not this regex.
 */
export const PASSWORD_POLICY_REGEX = /^.{8,}$/;

export const PASSWORD_POLICY_MESSAGE = 'Password must be at least 8 characters';
