import { IsBoolean, IsOptional, IsString, Length, MinLength } from 'class-validator';

export class MfaChallengeDto {
  @IsString()
  @MinLength(1)
  mfaToken!: string;

  @IsString()
  @Length(6, 6)
  code!: string;

  /** docs/12_SECURITY_SPECIFICATION.md "Trusted Devices" — opt-in, returns a device_token to remember. */
  @IsOptional()
  @IsBoolean()
  trustDevice?: boolean;
}
