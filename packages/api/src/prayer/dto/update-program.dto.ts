import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const PROGRAM_STATUSES = ['DRAFT', 'PLANNED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED'];

export class UpdateProgramDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  recurrenceRule?: string;

  @IsOptional()
  @IsIn(PROGRAM_STATUSES)
  status?: string;
}
