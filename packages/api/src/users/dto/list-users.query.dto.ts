import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import type { UserStatus } from '../user.entity';

export class ListUsersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['ACTIVE', 'LOCKED', 'SUSPENDED', 'DELETED'])
  status?: UserStatus;

  /** Part of a name or e-mail address. */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100)
  search?: string;
}
