import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { PRAYER_REQUEST_CATEGORIES } from '../prayer-constants';

const REQUEST_STATUSES = ['DRAFT', 'NEW', 'ASSIGNED', 'IN_PROGRESS', 'WAITING', 'ANSWERED', 'ARCHIVED', 'RESTORED'];

export class ListPrayerRequestsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(REQUEST_STATUSES)
  status?: string;

  @IsOptional()
  @IsIn(PRAYER_REQUEST_CATEGORIES)
  category?: string;
}
