import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { SupabaseService } from '../supabase/supabase.service';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';
import { JwtPayload } from './interfaces/jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private readonly supabase: SupabaseService,
  ) {
    const secret = configService.get<string>('JWT_ACCESS_SECRET');
    if (!secret) throw new Error('JWT_ACCESS_SECRET must be set');
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    // Defense in depth: an MFA-pending token must only ever reach POST /auth/mfa/challenge,
    // which verifies it manually — never treat it as a normal, fully-authenticated session.
    if (payload.mfaPending) throw new UnauthorizedException('MFA verification required');

    const { data, error } = await this.supabase.client
      .from('users')
      .select('id, email, display_name, status')
      .eq('id', payload.sub)
      .is('deleted_at', null)
      .maybeSingle();
    if (error || !data) throw new UnauthorizedException('Invalid session');
    if (data.status !== 'ACTIVE') throw new UnauthorizedException('Account is not active');
    return data as AuthenticatedUser;
  }
}
