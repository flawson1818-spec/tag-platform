import { randomBytes, createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { JwtPayload } from './interfaces/jwt-payload.interface';

export interface RefreshTokenPair {
  token: string;
  hash: string;
  expiresAt: Date;
}

const MFA_PENDING_TOKEN_TTL_SECONDS = 300;

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  get accessTokenExpiresInSeconds(): number {
    return Number(this.configService.get('JWT_ACCESS_EXPIRES_IN_SECONDS') ?? 900);
  }

  createAccessToken(payload: JwtPayload): string {
    return this.jwtService.sign(payload, { expiresIn: this.accessTokenExpiresInSeconds });
  }

  /** Used outside the HTTP guard pipeline (e.g. WebSocket handshake) — returns null instead of throwing. */
  verifyAccessToken(token: string): JwtPayload | null {
    try {
      return this.jwtService.verify<JwtPayload>(token);
    } catch {
      return null;
    }
  }

  /** Issued once a password checks out for an MFA-enabled account — proves "who" but not "done
   *  yet". Never accepted by JwtStrategy as a real session (see JwtStrategy.validate). */
  createMfaPendingToken(payload: Omit<JwtPayload, 'mfaPending'>): string {
    return this.jwtService.sign({ ...payload, mfaPending: true }, { expiresIn: MFA_PENDING_TOKEN_TTL_SECONDS });
  }

  /** Returns the user id only if `token` is a still-valid, correctly-flagged MFA-pending token. */
  verifyMfaPendingToken(token: string): string | null {
    const payload = this.verifyAccessToken(token);
    return payload?.mfaPending ? payload.sub : null;
  }

  createRefreshTokenPair(): RefreshTokenPair {
    const days = Number(this.configService.get('JWT_REFRESH_EXPIRES_IN_DAYS') ?? 30);
    const token = randomBytes(48).toString('hex');
    return {
      token,
      hash: this.hashToken(token),
      expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
    };
  }

  hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }
}
