import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Every field optional; an empty string clears it. */
export class UpdateMemberProfileDto {
  @IsOptional()
  @Transform(trim)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(500)
  bio?: string | null;

  @IsOptional()
  @Transform(trim)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(120)
  churchName?: string | null;

  @IsOptional()
  @Transform(trim)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(80)
  city?: string | null;
}
