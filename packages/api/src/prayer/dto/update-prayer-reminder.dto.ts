import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const DAYS_OF_WEEK = [0, 1, 2, 3, 4, 5, 6];

export class UpdatePrayerReminderDto {
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'timeOfDay must be in 24h "HH:MM" format' })
  timeOfDay?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @IsIn(DAYS_OF_WEEK, { each: true })
  daysOfWeek?: number[];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezone?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
