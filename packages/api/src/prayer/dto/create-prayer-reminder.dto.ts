import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const DAYS_OF_WEEK = [0, 1, 2, 3, 4, 5, 6]; // 0 = dimanche ... 6 = samedi (JS Date.getDay() convention)

export class CreatePrayerReminderDto {
  /** 24h "HH:MM", evaluated in `timezone` — see docs/01_FUNCTIONAL_SPECIFICATION.md §11 "Rappel de prière (planifié par l'utilisateur)". */
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'timeOfDay must be in 24h "HH:MM" format' })
  timeOfDay!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @IsIn(DAYS_OF_WEEK, { each: true })
  daysOfWeek!: number[];

  @IsString()
  @MaxLength(100)
  timezone!: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
