import { IsString, MinLength } from 'class-validator';

export class MfaRecoveryChallengeDto {
  @IsString()
  @MinLength(1)
  mfaToken!: string;

  @IsString()
  @MinLength(1)
  recoveryCode!: string;
}
