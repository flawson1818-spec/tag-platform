import { IsIn } from 'class-validator';

export class UpdateUserStatusDto {
  @IsIn(['ACTIVE', 'LOCKED', 'SUSPENDED'])
  status!: 'ACTIVE' | 'LOCKED' | 'SUSPENDED';
}
