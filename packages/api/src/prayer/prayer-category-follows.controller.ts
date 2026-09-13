import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../access/decorators/current-user.decorator';
import { JwtAuthGuard } from '../access/jwt-auth.guard';
import type { AuthenticatedUser } from '../access/interfaces/authenticated-user.interface';
import { FollowPrayerCategoryDto } from './dto/follow-prayer-category.dto';
import { PrayerCategoryFollowsService } from './prayer-category-follows.service';

/** docs/01_FUNCTIONAL_SPECIFICATION.md §11 "Début d'un sujet suivi/favori" — self-service only. */
@ApiTags('prayer-category-follows')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('prayer-category-follows')
export class PrayerCategoryFollowsController {
  constructor(private readonly followsService: PrayerCategoryFollowsService) {}

  @Post()
  follow(@CurrentUser() currentUser: AuthenticatedUser, @Body() dto: FollowPrayerCategoryDto) {
    return this.followsService.follow(currentUser.id, dto.category);
  }

  @Get()
  list(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.followsService.listForUser(currentUser.id);
  }

  @Delete(':category')
  @HttpCode(HttpStatus.NO_CONTENT)
  unfollow(@CurrentUser() currentUser: AuthenticatedUser, @Param('category') category: string) {
    return this.followsService.unfollow(currentUser.id, category);
  }
}
