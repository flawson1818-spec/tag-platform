import { Controller, Get, Param, ParseUUIDPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../access/decorators/current-user.decorator';
import { JwtAuthGuard } from '../access/jwt-auth.guard';
import type { AuthenticatedUser } from '../access/interfaces/authenticated-user.interface';
import { ListNotificationsQueryDto } from './dto/list-notifications.query.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(@CurrentUser() currentUser: AuthenticatedUser, @Query() query: ListNotificationsQueryDto) {
    return this.notificationsService.listForUser(currentUser.id, query);
  }

  @Patch(':id/read')
  markRead(@CurrentUser() currentUser: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.notificationsService.markRead(id, currentUser.id);
  }

  @Patch('read-all')
  markAllRead(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.notificationsService.markAllRead(currentUser.id);
  }

  @Patch(':id/archive')
  archive(@CurrentUser() currentUser: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.notificationsService.archive(id, currentUser.id);
  }
}
