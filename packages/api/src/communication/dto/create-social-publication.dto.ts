import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { SOCIAL_CHANNELS } from '../social-publication.entity';

export class CreateSocialPublicationDto {
  @IsIn(SOCIAL_CHANNELS)
  channel!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(3000)
  draftContent!: string;

  @IsOptional()
  @IsUUID()
  testimonyId?: string;
}
