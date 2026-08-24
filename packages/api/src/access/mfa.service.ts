import { Injectable } from '@nestjs/common';
import { authenticator } from 'otplib';

const ISSUER = 'TAG';

/** Thin wrapper around otplib so AuthService/AuthController never touch the library directly. */
@Injectable()
export class MfaService {
  generateSecret(): string {
    return authenticator.generateSecret();
  }

  keyUri(email: string, secret: string): string {
    return authenticator.keyuri(email, ISSUER, secret);
  }

  verify(code: string, secret: string): boolean {
    try {
      return authenticator.check(code, secret);
    } catch {
      return false;
    }
  }
}
