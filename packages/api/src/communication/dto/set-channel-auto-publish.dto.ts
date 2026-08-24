import { IsBoolean } from 'class-validator';

export class SetChannelAutoPublishDto {
  @IsBoolean()
  autoPublish!: boolean;
}
