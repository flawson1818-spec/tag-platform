import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

const ALLOWED_MIME_PREFIX = /^(image|audio|video)\/[a-zA-Z0-9.+-]+$|^application\/pdf$/;
/** Photos stay at 25 Mo (checked in the service); a video may reach 50 Mo, the platform's storage limit. */
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

export class PresignFileDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  filename!: string;

  @IsString()
  @Matches(ALLOWED_MIME_PREFIX, {
    message: 'mimeType must be image/*, audio/*, video/* or application/pdf',
  })
  mimeType!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_FILE_SIZE_BYTES)
  sizeBytes?: number;
}
