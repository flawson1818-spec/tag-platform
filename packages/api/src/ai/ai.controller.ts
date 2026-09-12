import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle, seconds } from '@nestjs/throttler';
import { CurrentUser } from '../access/decorators/current-user.decorator';
import { JwtAuthGuard } from '../access/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../access/optional-jwt-auth.guard';
import type { AuthenticatedUser } from '../access/interfaces/authenticated-user.interface';
import { AiAgentsService } from './ai-agents.service';
import { AiChatDto } from './dto/ai-chat.dto';
import { SetFaithPathLevelDto } from './dto/set-faith-path-level.dto';
import { FAITH_PATH_STEPS, FAITH_PATH_STEP_LABELS } from './faith-path.entity';
import { FaithPathService } from './faith-path.service';

@ApiTags('ai')
@Controller('ai')
export class AiController {
  constructor(
    private readonly aiAgentsService: AiAgentsService,
    private readonly faithPathService: FaithPathService,
  ) {}

  @Post('accueil/chat')
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { limit: 15, ttl: seconds(60) } })
  chatAccueil(@CurrentUser() currentUser: AuthenticatedUser | undefined, @Body() dto: AiChatDto) {
    return this.aiAgentsService.chatAccueil(dto, currentUser?.id ?? null);
  }

  @Post('evangelisation/chat')
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { limit: 15, ttl: seconds(60) } })
  chatEvangelisation(@CurrentUser() currentUser: AuthenticatedUser | undefined, @Body() dto: AiChatDto) {
    return this.aiAgentsService.chatEvangelisation(dto, currentUser?.id ?? null);
  }

  /**
   * docs/02_AI_AGENTS_SPECIFICATION.md §4 "parcours de découverte de la foi structuré" — the
   * fixed step sequence is static app config, not data, so it's returned alongside the caller's
   * own progress rather than needing a separate lookup.
   */
  @Get('evangelisation/faith-path')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async getFaithPath(@CurrentUser() currentUser: AuthenticatedUser) {
    const progress = await this.faithPathService.get(currentUser.id);
    return {
      ...progress,
      steps: FAITH_PATH_STEPS.map((step) => ({ step, label: FAITH_PATH_STEP_LABELS[step] })),
    };
  }

  @Post('evangelisation/faith-path/level')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  setFaithPathLevel(@CurrentUser() currentUser: AuthenticatedUser, @Body() dto: SetFaithPathLevelDto) {
    return this.faithPathService.setLevel(currentUser.id, dto.level);
  }

  @Post('evangelisation/faith-path/advance')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  advanceFaithPath(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.faithPathService.advance(currentUser.id);
  }
}
