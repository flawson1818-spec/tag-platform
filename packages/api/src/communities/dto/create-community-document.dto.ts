import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateCommunityDocumentDto {
  @IsUUID()
  fileId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;
}
