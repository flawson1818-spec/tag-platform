import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';
import { PRAYER_CATEGORIES, PRAYER_IMPORTANCE_LEVELS } from '../prayer-constants';

export class CreateSlotDto {
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  title!: string;

  @IsIn(PRAYER_CATEGORIES)
  category!: string;

  @IsOptional()
  @IsIn(PRAYER_IMPORTANCE_LEVELS)
  importance?: string;

  @IsDateString()
  startAt!: string;

  @IsDateString()
  endAt!: string;

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
