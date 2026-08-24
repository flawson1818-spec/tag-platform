import { IsString, Length } from 'class-validator';

export class VerifyMfaCodeDto {
  @IsString()
  @Length(6, 6)
  code!: string;
}
