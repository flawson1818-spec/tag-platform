import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
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

  /** docs/07_UX_UI_SPECIFICATION.md §9 "Découverte (recherche/invitation)" — search by name. */
  @IsOptional()
  @IsString()
  @MaxLength(150)
  search?: string;
}
