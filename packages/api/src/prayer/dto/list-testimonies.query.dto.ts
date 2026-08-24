import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

const TESTIMONY_STATUSES = ['DRAFT', 'PUBLISHED', 'EDITED', 'ARCHIVED'];

export class ListTestimoniesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(TESTIMONY_STATUSES)
  status?: string;

  /** docs/07_UX_UI_SPECIFICATION.md §8 (Profil — "Mes témoignages"): only the caller's own, any status. */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  mine?: boolean;
}
