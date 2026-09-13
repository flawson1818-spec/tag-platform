import { IsIn } from 'class-validator';
import { PRAYER_CATEGORIES } from '../prayer-constants';

export class FollowPrayerCategoryDto {
  @IsIn(PRAYER_CATEGORIES)
  category!: string;
}
