import { Body, Controller, Get, HttpCode, HttpStatus, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../access/decorators/current-user.decorator';
import { JwtAuthGuard } from '../access/jwt-auth.guard';
import type { AuthenticatedUser } from '../access/interfaces/authenticated-user.interface';
import { SetLeaderboardOptInDto } from './dto/set-leaderboard-opt-in.dto';
import { GamificationService } from './gamification.service';

@ApiTags('gamification')
@Controller('gamification')
export class GamificationController {
  constructor(private readonly gamificationService: GamificationService) {}

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  getMyStats(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.gamificationService.getMyStats(currentUser.id);
  }

  @Get('community-goal')
  getCommunityGoal() {
    return this.gamificationService.getCommunityGoal();
  }

  @Get('leaderboard')
  getLeaderboard() {
    return this.gamificationService.getLeaderboard();
  }

  @Patch('leaderboard-opt-in')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  setLeaderboardOptIn(@CurrentUser() currentUser: AuthenticatedUser, @Body() dto: SetLeaderboardOptInDto) {
    return this.gamificationService.setLeaderboardOptIn(currentUser.id, dto.optIn);
  }
}
