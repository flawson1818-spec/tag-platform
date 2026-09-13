import { IsBoolean, IsOptional, IsString, Length, MinLength } from 'class-validator';

export class MfaOtpChallengeDto {
  @IsString()
  @MinLength(1)
  mfaToken!: string;

  @IsString()
  @Length(6, 6)
  code!: string;

  @IsOptional()
  @IsBoolean()
  trustDevice?: boolean;
}
