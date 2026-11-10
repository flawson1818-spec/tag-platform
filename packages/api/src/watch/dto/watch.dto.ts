import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class SetIntentionDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  description?: string;

  /** "Psaumes 2:8 — Demande-moi et je te donnerai les nations…" */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  bibleReference?: string;
}

export class SetFlambeauDto {
  @IsUUID()
  guardianId!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  encouragement?: string;
}

/** The guardian ticks an item of the watch list, or writes the day's encouragement. */
export class UpdateFlambeauDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  item?: number;

  @IsOptional()
  @IsBoolean()
  done?: boolean;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  encouragement?: string;
}
