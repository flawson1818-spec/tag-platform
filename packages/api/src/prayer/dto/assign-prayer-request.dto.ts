import { IsOptional, IsUUID } from 'class-validator';

export class AssignPrayerRequestDto {
  /** The intercessor who will carry the request; omitted or null to take it back. */
  @IsOptional()
  @IsUUID()
  userId?: string | null;
}
