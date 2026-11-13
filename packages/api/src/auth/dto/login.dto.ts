import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  /** The e-mail address or the phone number the account was created with. */
  @IsString()
  @MinLength(3)
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;

  /** docs/12_SECURITY_SPECIFICATION.md "Trusted Devices" — skips the MFA challenge when valid. */
  @IsOptional()
  @IsString()
  deviceToken?: string;
}
