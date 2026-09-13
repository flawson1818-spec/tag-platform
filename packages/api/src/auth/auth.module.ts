import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { CommunicationModule } from '../communication/communication.module';
import { RolesModule } from '../roles/roles.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MfaOtpService } from './mfa-otp.service';

@Module({
  imports: [SupabaseModule, AccessModule, UsersModule, RolesModule, CommunicationModule],
  controllers: [AuthController],
  providers: [AuthService, MfaOtpService],
})
export class AuthModule {}
