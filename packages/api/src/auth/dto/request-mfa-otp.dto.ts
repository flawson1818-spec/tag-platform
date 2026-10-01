import { IsIn, IsString, MinLength } from 'class-validator';
import { MFA_OTP_CHANNELS, MfaOtpChannel } from '../mfa-otp.service';

export class RequestMfaOtpDto {
  @IsString()
  @MinLength(1)
  mfaToken!: string;

  @IsIn(MFA_OTP_CHANNELS)
  channel!: MfaOtpChannel;
}

export class MfaOtpChannelsDto {
  @IsString()
  @MinLength(1)
  mfaToken!: string;
}
