import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class AddMemberDto {
  @IsUUID()
  userId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  internalRole?: string;
}
