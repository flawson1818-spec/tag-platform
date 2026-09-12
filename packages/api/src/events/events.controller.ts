import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../access/decorators/current-user.decorator';
import { JwtAuthGuard } from '../access/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../access/optional-jwt-auth.guard';
import { PermissionsService } from '../access/permissions.service';
import type { AuthenticatedUser } from '../access/interfaces/authenticated-user.interface';
import { CreateBreakoutRoomsDto } from './dto/create-breakout-rooms.dto';
import { CreateEventDto } from './dto/create-event.dto';
import { CreateEventPollDto } from './dto/create-event-poll.dto';
import { ListEventsQueryDto } from './dto/list-events.query.dto';
import { UpdateEventStatusDto } from './dto/update-event-status.dto';
import { UpdateParticipantRoleDto } from './dto/update-participant-role.dto';
import { VoteEventPollDto } from './dto/vote-event-poll.dto';
import { EventBreakoutRoomsService } from './event-breakout-rooms.service';
import { EventPollsService } from './event-polls.service';
import { EventStatus } from './event.entity';
import { EventsService } from './events.service';

const EVENT_PERMISSION = 'event.manage';

@ApiTags('events')
@Controller('events')
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly permissionsService: PermissionsService,
    private readonly breakoutRoomsService: EventBreakoutRoomsService,
    private readonly pollsService: EventPollsService,
  ) {}

  /**
   * docs/06_RBAC_SPECIFICATION.md section 1: a community-scoped role assignment must
   * count within its own community, not only global assignments — event.manage checked
   * via the plain @RequirePermission guard never passed communityId, so a Responsable+
   * scoped to one community could never manage that community's own events.
   */
  private async assertCanManage(userId: string, communityId: string | null): Promise<void> {
    const permissions = await this.permissionsService.getUserPermissionCodes(userId, communityId ?? undefined);
    if (!permissions.has(EVENT_PERMISSION)) {
      throw new ForbiddenException(`Missing permission: ${EVENT_PERMISSION}`);
    }
  }

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
  @UseGuards(JwtAuthGuard)
  async create(@CurrentUser() currentUser: AuthenticatedUser, @Body() dto: CreateEventDto) {
    await this.assertCanManage(currentUser.id, dto.communityId ?? null);
    return this.eventsService.create(dto, currentUser.id);
  }

  @Patch(':id/status')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async updateStatus(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEventStatusDto,
  ) {
    const event = await this.eventsService.findById(id);
    await this.assertCanManage(currentUser.id, event.community_id);
    return this.eventsService.updateStatus(id, dto.status as EventStatus, currentUser.id);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() currentUser: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    const event = await this.eventsService.findById(id);
    await this.assertCanManage(currentUser.id, event.community_id);
    return this.eventsService.softDelete(id, currentUser.id);
  }

  @Post(':id/join')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  join(@CurrentUser() currentUser: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.eventsService.join(id, currentUser.id);
  }

  @Post(':id/hand-raise')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  raiseHand(@CurrentUser() currentUser: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.eventsService.raiseHand(id, currentUser.id);
  }

  @Post(':id/hand-lower')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  lowerHand(@CurrentUser() currentUser: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.eventsService.lowerHand(id, currentUser.id);
  }

  @Patch(':id/participants/:userId/role')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async setParticipantRole(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateParticipantRoleDto,
  ) {
    const event = await this.eventsService.findById(id);
    await this.assertCanManage(currentUser.id, event.community_id);
    return this.eventsService.setParticipantRole(id, userId, dto.role);
  }

  /** docs/05_API_SPECIFICATION.md section 5: "POST /events/:id/breakout-rooms (Modérateur+ — répartition)". */
  @Post(':id/breakout-rooms')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async createBreakoutRooms(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateBreakoutRoomsDto,
  ) {
    const event = await this.eventsService.findById(id);
    await this.assertCanManage(currentUser.id, event.community_id);
    return this.breakoutRoomsService.create(id, dto);
  }

  @Get(':id/breakout-rooms')
  listBreakoutRooms(@Param('id', ParseUUIDPipe) id: string) {
    return this.breakoutRoomsService.listRooms(id);
  }

  @Get(':id/breakout-rooms/me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  myBreakoutRoom(@CurrentUser() currentUser: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.breakoutRoomsService.myAssignment(id, currentUser.id);
  }

  /** docs/07_UX_UI_SPECIFICATION.md §7 error case: never blocks — redirects to the least-loaded room if full. */
  @Post(':id/breakout-rooms/:roomId/join')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  joinBreakoutRoom(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('roomId', ParseUUIDPipe) roomId: string,
  ) {
    return this.breakoutRoomsService.join(id, currentUser.id, roomId);
  }

  /** "Retour salle principale" (docs/07_UX_UI_SPECIFICATION.md §7 parcours utilisateur). */
  @Post(':id/breakout-rooms/leave')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  leaveBreakoutRoom(@CurrentUser() currentUser: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.breakoutRoomsService.leave(id, currentUser.id);
  }

  /** docs/01_FUNCTIONAL_SPECIFICATION.md §7.2 "Voter (sondage)" — moderator-only creation. */
  @Post(':id/polls')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async createPoll(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateEventPollDto,
  ) {
    const event = await this.eventsService.findById(id);
    await this.assertCanManage(currentUser.id, event.community_id);
    return this.pollsService.create(id, currentUser.id, dto);
  }

  @Get(':id/polls')
  @UseGuards(OptionalJwtAuthGuard)
  listPolls(@CurrentUser() currentUser: AuthenticatedUser | undefined, @Param('id', ParseUUIDPipe) id: string) {
    return this.pollsService.list(id, currentUser?.id ?? null);
  }

  @Post(':id/polls/:pollId/vote')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  votePoll(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('pollId', ParseUUIDPipe) pollId: string,
    @Body() dto: VoteEventPollDto,
  ) {
    return this.pollsService.vote(pollId, currentUser.id, dto.optionIndex);
  }

  @Post(':id/polls/:pollId/close')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async closePoll(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('pollId', ParseUUIDPipe) pollId: string,
  ) {
    const event = await this.eventsService.findById(id);
    await this.assertCanManage(currentUser.id, event.community_id);
    return this.pollsService.close(pollId, currentUser.id);
  }
}
