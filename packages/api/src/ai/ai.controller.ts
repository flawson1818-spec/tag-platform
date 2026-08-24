import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle, seconds } from '@nestjs/throttler';
import { CurrentUser } from '../access/decorators/current-user.decorator';
import { OptionalJwtAuthGuard } from '../access/optional-jwt-auth.guard';
import type { AuthenticatedUser } from '../access/interfaces/authenticated-user.interface';
import { AiAgentsService } from './ai-agents.service';
import { AiChatDto } from './dto/ai-chat.dto';

@ApiTags('ai')
@Controller('ai')
export class AiController {
  constructor(private readonly aiAgentsService: AiAgentsService) {}

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
}
