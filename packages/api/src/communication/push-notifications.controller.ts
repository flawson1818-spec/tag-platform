import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../access/decorators/current-user.decorator';
import { JwtAuthGuard } from '../access/jwt-auth.guard';
import type { AuthenticatedUser } from '../access/interfaces/authenticated-user.interface';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';
import { UnregisterPushTokenDto } from './dto/unregister-push-token.dto';
import { PushNotificationsService } from './push-notifications.service';

@ApiTags('push')
@Controller('push')
export class PushNotificationsController {
  constructor(private readonly pushNotificationsService: PushNotificationsService) {}

  /** Public — the frontend needs this before the user is necessarily logged in to subscribe. */
  @Get('vapid-public-key')
  vapidPublicKey() {
    return { publicKey: this.pushNotificationsService.getVapidPublicKey() };
  }

  @Post('register')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  register(@CurrentUser() currentUser: AuthenticatedUser, @Body() dto: RegisterPushTokenDto) {
    return this.pushNotificationsService.registerToken(currentUser.id, dto.token, dto.platform);
  }

  @Delete('register')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  unregister(@CurrentUser() currentUser: AuthenticatedUser, @Body() dto: UnregisterPushTokenDto) {
    return this.pushNotificationsService.unregisterToken(currentUser.id, dto.token);
  }
}
