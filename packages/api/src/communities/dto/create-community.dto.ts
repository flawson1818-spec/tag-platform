import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { COMMUNITY_TYPES } from '../community.entity';

export class CreateCommunityDto {
  @IsIn(COMMUNITY_TYPES)
  type!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name!: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  timezone?: string;
}
