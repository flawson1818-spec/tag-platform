import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class MfaRecoveryChallengeDto {
  @IsString()
  @MinLength(1)
  mfaToken!: string;

  @IsString()
  @MinLength(1)
  recoveryCode!: string;

  /** docs/12_SECURITY_SPECIFICATION.md "Trusted Devices" — opt-in, returns a device_token to remember. */
  @IsOptional()
  @IsBoolean()
  trustDevice?: boolean;
}
