import { IsString, MaxLength, MinLength } from 'class-validator';

export class ForgotPasswordDto {
  /** The e-mail address or the phone number of the account. */
  @IsString()
  @MinLength(3)
  @MaxLength(254)
  email!: string;
}
