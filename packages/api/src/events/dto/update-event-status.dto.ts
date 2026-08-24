import { IsIn } from 'class-validator';

const EVENT_STATUSES = ['CREATED', 'SCHEDULED', 'OPEN', 'RUNNING', 'FINISHED', 'ARCHIVED'];

export class UpdateEventStatusDto {
  @IsIn(EVENT_STATUSES)
  status!: string;
}
