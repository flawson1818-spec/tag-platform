import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateCommunityDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  timezone?: string;
}
