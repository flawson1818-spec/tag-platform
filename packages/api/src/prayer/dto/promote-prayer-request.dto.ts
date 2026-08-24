import { IsUUID } from 'class-validator';

export class PromotePrayerRequestDto {
  @IsUUID()
  programId!: string;
}
