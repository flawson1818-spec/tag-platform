import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

const MEDIA_TYPES = ['TEXT', 'AUDIO', 'VIDEO', 'PHOTO'];

/** docs/07_UX_UI_SPECIFICATION.md §6 — a rejected testimony's author can revise and resubmit it. */
export class UpdateTestimonyDto {
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
}
