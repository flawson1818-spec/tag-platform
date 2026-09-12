import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateBreakoutRoomsDto {
  @IsInt()
  @Min(2)
  @Max(20)
  roomCount!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  labels?: string[];
}
