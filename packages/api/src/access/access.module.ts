import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { SupabaseModule } from '../supabase/supabase.module';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { MfaRecoveryCodesService } from './mfa-recovery-codes.service';
import { MfaService } from './mfa.service';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';
import { PermissionGuard } from './permission.guard';
import { PermissionsService } from './permissions.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { UserMutesService } from './user-mutes.service';

@Module({
  imports: [
    SupabaseModule,
    PassportModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_ACCESS_SECRET');
        if (!secret) throw new Error('JWT_ACCESS_SECRET must be set');
        return { secret };
      },
    }),
  ],
  providers: [
    JwtStrategy,
    JwtAuthGuard,
    MfaRecoveryCodesService,
    MfaService,
    OptionalJwtAuthGuard,
    PermissionGuard,
    PermissionsService,
    PasswordService,
    TokenService,
    UserMutesService,
  ],
  exports: [
    JwtAuthGuard,
    MfaRecoveryCodesService,
    MfaService,
    OptionalJwtAuthGuard,
    PermissionGuard,
    PermissionsService,
    PasswordService,
    TokenService,
    UserMutesService,
  ],
})
export class AccessModule {}
