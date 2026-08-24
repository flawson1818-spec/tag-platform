export interface JwtPayload {
  sub: string;
  email: string;
  /** Set only on the short-lived token issued between "password verified" and "TOTP verified"
   *  for an MFA-enabled account — never a valid access token. See MfaService/AuthService. */
  mfaPending?: boolean;
}
