import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  Max,
  Min,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

const HHMM = /^([01]?\d|2[0-3]):[0-5]\d$/;

export class DatedSegmentDto {
  /** Local time, "12:00". */
  @Matches(HHMM)
  start!: string;

  /** Local time, "12:03"; earlier than start means the next day. */
  @Matches(HHMM)
  end!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(150)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  guidedText?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(1500, { each: true })
  bibleReferences?: string[];
}

/** One créneau as written: "JEUDI 05 NOVEMBRE 2026" and its segments with their hours. */
export class DatedCreneauDto {
  /** "2026-11-05", local date of the créneau's first segment. */
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => DatedSegmentDto)
  segments!: DatedSegmentDto[];
}

/** Up to a month of hourly créneaux in one paste. */
export class AddCreneauxDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(800)
  @ValidateNested({ each: true })
  @Type(() => DatedCreneauDto)
  creneaux!: DatedCreneauDto[];

  /** Repeat the pasted days over 7, 30 or up to 92 days (three months) from the first one. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(92)
  repeatDays?: number;
}
