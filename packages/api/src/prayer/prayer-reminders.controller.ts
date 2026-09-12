import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../access/decorators/current-user.decorator';
import { JwtAuthGuard } from '../access/jwt-auth.guard';
import type { AuthenticatedUser } from '../access/interfaces/authenticated-user.interface';
import { CreatePrayerReminderDto } from './dto/create-prayer-reminder.dto';
import { UpdatePrayerReminderDto } from './dto/update-prayer-reminder.dto';
import { PrayerRemindersService } from './prayer-reminders.service';

/** docs/01_FUNCTIONAL_SPECIFICATION.md §11 "Rappel de prière (planifié par l'utilisateur)" — self-service only, never seen by anyone but the owner. */
@ApiTags('prayer-reminders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('prayer-reminders')
export class PrayerRemindersController {
  constructor(private readonly remindersService: PrayerRemindersService) {}

  @Post()
  create(@CurrentUser() currentUser: AuthenticatedUser, @Body() dto: CreatePrayerReminderDto) {
    return this.remindersService.create(currentUser.id, dto);
  }

  @Get()
  list(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.remindersService.listForUser(currentUser.id);
  }

  @Patch(':id')
  update(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePrayerReminderDto,
  ) {
    return this.remindersService.update(currentUser.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() currentUser: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.remindersService.remove(currentUser.id, id);
  }
}
