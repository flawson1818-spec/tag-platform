import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { JOIN_POLICIES } from '../community.entity';

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

  @IsOptional()
  @IsIn(JOIN_POLICIES)
  joinPolicy?: string;
}
