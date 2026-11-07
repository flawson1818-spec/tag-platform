import { Logger } from '@nestjs/common';
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { TokenService } from '../access/token.service';
import type { DirectMessage } from './messages.service';
import { webOrigins } from '../common/web-origin';

function userRoom(userId: string): string {
  return `user:${userId}`;
}

/**
 * Live delivery for private messages. Members only: a socket without a valid access token is
 * disconnected. Each member's open tabs share the room `user:<id>`; sending still goes through
 * POST /messages/conversations/:id/messages, this only pushes the stored message to both sides.
 *
 *   dm:message  { message }          a new message in one of my conversations
 *   dm:read     { conversationId }   I read a conversation in another tab — clear its badge
 */
@WebSocketGateway({ namespace: '/messages', cors: { origin: webOrigins() } })
export class MessagesGateway implements OnGatewayConnection {
  private readonly logger = new Logger(MessagesGateway.name);

  @WebSocketServer()
  server?: Server;

  constructor(private readonly tokenService: TokenService) {}

  handleConnection(client: Socket): void {
    const token = client.handshake.query.token;
    const userId = typeof token === 'string' ? this.tokenService.verifyAccessToken(token)?.sub : undefined;
    if (!userId) {
      client.disconnect(true);
      return;
    }
    void client.join(userRoom(userId));
  }

  emitMessage(userIds: string[], message: DirectMessage): void {
    if (!this.server) return;
    try {
      this.server.to(userIds.map(userRoom)).emit('dm:message', { message });
    } catch (err) {
      this.logger.warn(`Live delivery failed: ${(err as Error).message}`);
    }
  }

  emitRead(userId: string, conversationId: string): void {
    this.server?.to(userRoom(userId)).emit('dm:read', { conversationId });
  }
}
