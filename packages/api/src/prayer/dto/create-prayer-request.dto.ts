import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { CONFIDENTIALITY_LEVELS, PRAYER_REQUEST_CATEGORIES } from '../prayer-constants';

export class CreatePrayerRequestDto {
  @IsIn(PRAYER_REQUEST_CATEGORIES)
  category!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  description!: string;

  @IsOptional()
  @IsIn(CONFIDENTIALITY_LEVELS)
  confidentiality?: string;

  @IsOptional()
  @IsUUID()
  photoFileId?: string;

  @IsOptional()
  @IsUUID()
  attachmentFileId?: string;
}
