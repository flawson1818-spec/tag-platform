import { IsString, MinLength } from 'class-validator';

export class UnregisterPushTokenDto {
  @IsString()
  @MinLength(1)
  token!: string;
}
