import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ScheduleSegmentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  title!: string;

  /** 30 s to 2 h per segment ("Louange intense 12:30-12:33" → 180). */
  @Type(() => Number)
  @IsInt()
  @Min(30)
  @Max(7200)
  durationSeconds!: number;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  guidedText?: string;

  /** One verse per entry, "Jean 10:10 — Le voleur ne vient…". */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(1500, { each: true })
  bibleReferences?: string[];
}

/** A whole créneau, in order — docs/01_FUNCTIONAL_SPECIFICATION.md §3. */
export class ReplaceScheduleDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => ScheduleSegmentDto)
  segments!: ScheduleSegmentDto[];
}
