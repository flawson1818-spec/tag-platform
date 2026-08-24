import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

const MEDIA_TYPES = ['TEXT', 'AUDIO', 'VIDEO', 'PHOTO'];

export class CreateTestimonyDto {
  @IsOptional()
  @IsIn(MEDIA_TYPES)
  mediaType?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  content?: string;

  @IsOptional()
  @IsUUID()
  fileId?: string;

  @IsOptional()
  @IsUUID()
  relatedRequestId?: string;
}
