import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateProgramDto {
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  title!: string;

  @IsOptional()
  @IsUUID()
  communityId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  recurrenceRule?: string;
}
