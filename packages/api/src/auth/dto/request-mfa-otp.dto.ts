import { IsIn, IsString, MinLength } from 'class-validator';
import { MFA_OTP_CHANNELS } from '../mfa-otp.service';

export class RequestMfaOtpDto {
  @IsString()
  @MinLength(1)
  mfaToken!: string;

  @IsIn(MFA_OTP_CHANNELS)
  channel!: 'EMAIL' | 'WHATSAPP';
}
