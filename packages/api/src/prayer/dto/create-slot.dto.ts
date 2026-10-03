import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, MinLength } from 'class-validator';
import { TIME_OF_DAY_PATTERN } from '../daily-slot-time';

export class CreateSlotDto {
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  title!: string;

  /** "HH:mm", daily-recurring — see daily-slot-time.ts. No date: every slot repeats every day. */
  @Matches(TIME_OF_DAY_PATTERN, { message: 'startTime must be in HH:mm format' })
  startTime!: string;

  @Matches(TIME_OF_DAY_PATTERN, { message: 'endTime must be in HH:mm format' })
  endTime!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  guidedText?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  bibleReferences?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  recommendedSongs?: string[];

  @IsOptional()
  @IsUUID()
  leaderUserId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  orderIndex?: number;
}
