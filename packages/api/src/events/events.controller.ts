import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../access/decorators/current-user.decorator';
import { RequirePermission } from '../access/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../access/jwt-auth.guard';
import { PermissionGuard } from '../access/permission.guard';
import type { AuthenticatedUser } from '../access/interfaces/authenticated-user.interface';
import { CreateEventDto } from './dto/create-event.dto';
import { ListEventsQueryDto } from './dto/list-events.query.dto';
import { UpdateEventStatusDto } from './dto/update-event-status.dto';
import { EventStatus } from './event.entity';
import { EventsService } from './events.service';

@ApiTags('events')
@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  list(@Query() query: ListEventsQueryDto) {
    return this.eventsService.list(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.eventsService.findById(id);
  }

  @Get(':id/participants')
  listParticipants(@Param('id', ParseUUIDPipe) id: string) {
    return this.eventsService.listParticipants(id);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('event.manage')
  create(@CurrentUser() currentUser: AuthenticatedUser, @Body() dto: CreateEventDto) {
    return this.eventsService.create(dto, currentUser.id);
  }

  @Patch(':id/status')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('event.manage')
  updateStatus(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEventStatusDto,
  ) {
    return this.eventsService.updateStatus(id, dto.status as EventStatus, currentUser.id);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('event.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() currentUser: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.eventsService.softDelete(id, currentUser.id);
  }

  @Post(':id/join')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  join(@CurrentUser() currentUser: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.eventsService.join(id, currentUser.id);
  }
}
