import { IsIn } from 'class-validator';
import { FAITH_PATH_LEVELS, FaithPathLevel } from '../faith-path.entity';

export class SetFaithPathLevelDto {
  @IsIn(FAITH_PATH_LEVELS)
  level!: FaithPathLevel;
}
