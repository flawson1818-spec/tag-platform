import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../access/decorators/current-user.decorator';
import { JwtAuthGuard } from '../access/jwt-auth.guard';
import type { AuthenticatedUser } from '../access/interfaces/authenticated-user.interface';
import { OpenConversationDto } from './dto/open-conversation.dto';
import { SendDirectMessageDto } from './dto/send-direct-message.dto';
import { MessagesService } from './messages.service';

@ApiTags('messages')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get('conversations')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.messagesService.listConversations(user.id);
  }

  @Post('conversations')
  @HttpCode(HttpStatus.OK)
  open(@CurrentUser() user: AuthenticatedUser, @Body() dto: OpenConversationDto) {
    return this.messagesService.open(user.id, dto.memberId);
  }

  @Get('unread')
  unread(@CurrentUser() user: AuthenticatedUser) {
    return this.messagesService.unreadTotal(user.id);
  }

  @Get('conversations/:id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.messagesService.getConversation(user.id, id);
  }

  @Get('conversations/:id/messages')
  messages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('before') before?: string,
  ) {
    const valid = before && !Number.isNaN(Date.parse(before)) ? new Date(before).toISOString() : undefined;
    return this.messagesService.listMessages(user.id, id, valid);
  }

  @Post('conversations/:id/messages')
  send(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SendDirectMessageDto) {
    return this.messagesService.send(user.id, id, dto.content);
  }

  @Post('conversations/:id/read')
  @HttpCode(HttpStatus.OK)
  read(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.messagesService.markRead(user.id, id);
  }

  @Post('blocks/:memberId')
  @HttpCode(HttpStatus.OK)
  block(@CurrentUser() user: AuthenticatedUser, @Param('memberId', ParseUUIDPipe) memberId: string) {
    return this.messagesService.block(user.id, memberId);
  }

  @Delete('blocks/:memberId')
  unblock(@CurrentUser() user: AuthenticatedUser, @Param('memberId', ParseUUIDPipe) memberId: string) {
    return this.messagesService.unblock(user.id, memberId);
  }
}
