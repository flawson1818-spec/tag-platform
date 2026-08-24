import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

const TESTIMONY_STATUSES = ['DRAFT', 'PUBLISHED', 'EDITED', 'ARCHIVED'];

export class ListTestimoniesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(TESTIMONY_STATUSES)
  status?: string;
}
