import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { COMMUNITY_TYPES } from '../community.entity';
import type { CommunityType } from '../community.entity';

export class ListCommunitiesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(COMMUNITY_TYPES)
  type?: CommunityType;

  @IsOptional()
  @IsUUID()
  parentId?: string;
}
