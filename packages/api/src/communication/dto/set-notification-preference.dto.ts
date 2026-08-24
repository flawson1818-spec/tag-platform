import { IsBoolean } from 'class-validator';

export class SetNotificationPreferenceDto {
  @IsBoolean()
  enabled!: boolean;
}
