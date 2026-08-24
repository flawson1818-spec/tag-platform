/** Min 12 chars, upper, lower, digit, special char — see docs/12_SECURITY_SPECIFICATION.md. */
export const PASSWORD_POLICY_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/;

export const PASSWORD_POLICY_MESSAGE =
  'Password must be at least 12 characters and include an uppercase letter, a lowercase letter, a digit and a special character';
