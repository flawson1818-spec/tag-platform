import { IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ListAnnouncementsQueryDto extends PaginationQueryDto {
  /** Omitted = nation-wide broadcasts only; given = that community's own plus nation-wide. */
  @IsOptional()
  @IsUUID()
  communityId?: string;
}
