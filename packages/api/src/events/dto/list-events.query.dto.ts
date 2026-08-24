import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { EVENT_TYPES, EventType } from '../event.entity';

export class ListEventsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(EVENT_TYPES)
  type?: EventType;

  @IsOptional()
  @IsUUID()
  communityId?: string;
}
