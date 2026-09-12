import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;

  /** docs/12_SECURITY_SPECIFICATION.md "Trusted Devices" — skips the MFA challenge when valid. */
  @IsOptional()
  @IsString()
  deviceToken?: string;
}
