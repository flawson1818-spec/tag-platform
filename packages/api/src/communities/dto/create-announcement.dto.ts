import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateAnnouncementDto {
  /** Omitted = nation-wide (docs/01_FUNCTIONAL_SPECIFICATION.md §1.2: Pasteur "à l'échelle... nation"). */
  @IsOptional()
  @IsUUID()
  communityId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content!: string;
}
