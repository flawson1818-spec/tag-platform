import { IsString, Matches, MinLength } from 'class-validator';
import { PASSWORD_POLICY_MESSAGE, PASSWORD_POLICY_REGEX } from '../password-policy';

export class ResetPasswordDto {
  @IsString()
  @MinLength(1)
  token!: string;

  @IsString()
  @Matches(PASSWORD_POLICY_REGEX, { message: PASSWORD_POLICY_MESSAGE })
  newPassword!: string;
}
