import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { EVENT_TYPES, EventType } from '../event.entity';

export class CreateEventDto {
  @IsIn(EVENT_TYPES)
  type!: EventType;

  @IsString()
  @MinLength(1)
  @MaxLength(150)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsDateString()
  scheduledAt!: string;

  @IsOptional()
  @IsUUID()
  communityId?: string;
}
