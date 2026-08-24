import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

const SOCIAL_PUBLICATION_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PUBLISHED', 'REJECTED'];

export class ListSocialPublicationsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(SOCIAL_PUBLICATION_STATUSES)
  status?: string;
}
