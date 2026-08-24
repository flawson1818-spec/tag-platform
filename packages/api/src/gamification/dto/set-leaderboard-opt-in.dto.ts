import { IsBoolean } from 'class-validator';

export class SetLeaderboardOptInDto {
  @IsBoolean()
  optIn!: boolean;
}
