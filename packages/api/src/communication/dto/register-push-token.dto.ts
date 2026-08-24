import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import type { PushPlatform } from '../push-token.entity';

const PUSH_PLATFORMS: PushPlatform[] = ['IOS', 'ANDROID', 'WEB', 'UNKNOWN'];

export class RegisterPushTokenDto {
  @IsString()
  @MinLength(1)
  token!: string;

  @IsOptional()
  @IsIn(PUSH_PLATFORMS)
  platform?: PushPlatform;
}
