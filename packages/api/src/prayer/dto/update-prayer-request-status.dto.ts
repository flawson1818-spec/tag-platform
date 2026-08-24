import { IsIn } from 'class-validator';

const REQUEST_STATUSES = ['NEW', 'ASSIGNED', 'IN_PROGRESS', 'WAITING', 'ANSWERED', 'ARCHIVED', 'RESTORED'];

export class UpdatePrayerRequestStatusDto {
  @IsIn(REQUEST_STATUSES)
  status!: string;
}
