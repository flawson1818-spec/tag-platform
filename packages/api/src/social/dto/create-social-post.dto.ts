import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { POST_KINDS } from '../social.service';

export class CreateSocialPostDto {
  /** May be empty when the post is photos only; at least one of the two is required. */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(5000)
  content?: string;

  /** Up to 4 images the author uploaded through POST /files/presign. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @IsUUID('4', { each: true })
  photoFileIds?: string[];

  /** Publish in one of my communities instead of on my own profile. */
  @IsOptional()
  @IsUUID()
  communityId?: string;

  /** A message, an experience lived, or a longer writing. */
  @IsOptional()
  @IsIn(POST_KINDS)
  kind?: (typeof POST_KINDS)[number];
}
