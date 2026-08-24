import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import type { UserStatus } from '../user.entity';

export class ListUsersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['ACTIVE', 'LOCKED', 'SUSPENDED', 'DELETED'])
  status?: UserStatus;
}
