import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

const NOTIFICATION_STATUSES = ['CREATED', 'QUEUED', 'SENT', 'DELIVERED', 'READ', 'ARCHIVED'];

export class ListNotificationsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(NOTIFICATION_STATUSES)
  status?: string;
}
