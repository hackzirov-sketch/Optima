import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ChatService } from '../chat/chat.service';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';

export interface WsUser {
  id: string;
  email: string;
  workspaceIds: string[];
}

// ─── DTOs ──────────────────────────────────────────────
export interface SendMessageWsDto {
  roomId: string;
  text: string;
  replyToId?: string;
}

export interface TypingDto {
  roomId: string;
  typing: boolean;
}

export interface JoinRoomDto {
  roomId: string;
}

export interface AddReactionWsDto {
  messageId: string;
  roomId: string;
  emoji: string;
}

@Injectable()
@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3001',
    credentials: true,
  },
  namespace: '/',
  transports: ['websocket', 'polling'],
})
export class EventsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(EventsGateway.name);

  // socketId → userId
  private readonly socketUser = new Map<string, string>();
  // userId → Set<socketId>
  private readonly userSockets = new Map<string, Set<string>>();
  // userId → online status
  private readonly onlineUsers = new Set<string>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly chatService: ChatService,
    @InjectRepository(WorkspaceMember)
    private readonly wsMemberRepo: Repository<WorkspaceMember>,
  ) {}

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway initialized ✅');
  }

  // ─── Auth middleware ─────────────────────────────────
  private extractUser(client: Socket): WsUser | null {
    const token =
      client.handshake.auth?.token ||
      client.handshake.headers?.authorization?.replace('Bearer ', '');

    if (!token) return null;

    try {
      const secret = this.configService.get<string>('jwt.accessSecret');
      const payload = this.jwtService.verify(token, { secret });
      return {
        id: payload.sub,
        email: payload.email,
        workspaceIds: payload.workspaceIds || [],
      };
    } catch {
      return null;
    }
  }

  async handleConnection(client: Socket) {
    const user = this.extractUser(client);

    if (!user) {
      this.logger.warn(`Unauthorized WS connection: ${client.id}`);
      client.emit('error', { message: 'Unauthorized', code: 'TOKEN_INVALID' });
      client.disconnect();
      return;
    }

    // Register mappings
    this.socketUser.set(client.id, user.id);
    if (!this.userSockets.has(user.id)) {
      this.userSockets.set(user.id, new Set());
    }
    this.userSockets.get(user.id)!.add(client.id);
    this.onlineUsers.add(user.id);

    // Auto-join personal room for direct notifications
    client.join(`user:${user.id}`);

    // Send current online users list to the newly connected client
    client.emit('online_users', { userIds: Array.from(this.onlineUsers) });

    // Broadcast this user coming online to everyone
    this.server.emit('user_online', { userId: user.id });

    this.logger.log(
      `Client connected: ${client.id} → userId=${user.id} (${this.onlineUsers.size} online)`,
    );
  }

  async handleDisconnect(client: Socket) {
    const userId = this.socketUser.get(client.id);
    if (!userId) return;

    this.socketUser.delete(client.id);
    const sockets = this.userSockets.get(userId);
    sockets?.delete(client.id);

    if (!sockets || sockets.size === 0) {
      this.userSockets.delete(userId);
      this.onlineUsers.delete(userId);
      // Broadcast offline only when ALL sockets for this user are gone
      this.server.emit('user_offline', { userId });
    }

    this.logger.log(
      `Client disconnected: ${client.id} → userId=${userId} (${this.onlineUsers.size} online)`,
    );
  }

  // ─── Workspace join/leave ────────────────────────────
  @SubscribeMessage('join_workspace')
  async handleJoinWorkspace(
    @MessageBody() data: { workspaceId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const userId = this.socketUser.get(client.id);
    if (!userId) throw new WsException('Not authenticated');

    const member = await this.wsMemberRepo.findOne({
      where: { workspaceId: data.workspaceId, userId },
    });
    if (!member) throw new WsException('Not a workspace member');

    client.join(`workspace:${data.workspaceId}`);
    return { event: 'workspace_joined', workspaceId: data.workspaceId };
  }

  @SubscribeMessage('leave_workspace')
  handleLeaveWorkspace(
    @MessageBody() data: { workspaceId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const userId = this.socketUser.get(client.id);
    if (!userId) throw new WsException('Not authenticated');

    client.leave(`workspace:${data.workspaceId}`);
    return { event: 'workspace_left', workspaceId: data.workspaceId };
  }

  // ─── Room join/leave ──────────────────────────────────
  @SubscribeMessage('join_room')
  handleJoinRoom(
    @MessageBody() data: JoinRoomDto,
    @ConnectedSocket() client: Socket,
  ) {
    const userId = this.socketUser.get(client.id);
    if (!userId) throw new WsException('Not authenticated');

    client.join(`room:${data.roomId}`);
    client.to(`room:${data.roomId}`).emit('user_joined_room', {
      userId,
      roomId: data.roomId,
    });
    return { event: 'joined', roomId: data.roomId };
  }

  @SubscribeMessage('leave_room')
  handleLeaveRoom(
    @MessageBody() data: JoinRoomDto,
    @ConnectedSocket() client: Socket,
  ) {
    const userId = this.socketUser.get(client.id);
    if (!userId) throw new WsException('Not authenticated');

    client.leave(`room:${data.roomId}`);
    client.to(`room:${data.roomId}`).emit('user_left_room', {
      userId,
      roomId: data.roomId,
    });
    return { event: 'left', roomId: data.roomId };
  }

  // ─── Typing indicator ────────────────────────────────
  @SubscribeMessage('typing')
  handleTyping(
    @MessageBody() data: TypingDto,
    @ConnectedSocket() client: Socket,
  ) {
    const userId = this.socketUser.get(client.id);
    if (!userId) return;

    client.to(`room:${data.roomId}`).emit('typing', {
      userId,
      roomId: data.roomId,
      typing: data.typing,
    });
  }

  // ─── Send message ────────────────────────────────────
  @SubscribeMessage('send_message')
  async handleSendMessage(
    @MessageBody() data: SendMessageWsDto,
    @ConnectedSocket() client: Socket,
  ) {
    const userId = this.socketUser.get(client.id);
    if (!userId) throw new WsException('Not authenticated');

    // Persist to DB — ChatService checks room membership internally
    let saved: any;
    try {
      saved = await this.chatService.sendMessage(data.roomId, userId, {
        content: data.text,
        replyToId: data.replyToId,
      });
    } catch (err: any) {
      // ForbiddenException → emit error back to sender only
      client.emit('error', {
        code: err?.response?.code || 'SEND_MESSAGE_FAILED',
        message: err?.message || 'Failed to send message',
      });
      return;
    }

    // Broadcast saved message to everyone in the room (including sender)
    this.server.to(`room:${data.roomId}`).emit('new_message', {
      id: saved.id,
      roomId: saved.roomId,
      senderId: saved.senderId,
      content: saved.content,
      replyToId: saved.replyToId || null,
      createdAt: saved.createdAt,
      reactions: [],
    });

    return { event: 'message_sent', messageId: saved.id };
  }

  // ─── Message reaction ─────────────────────────────────
  @SubscribeMessage('add_reaction')
  async handleAddReaction(
    @MessageBody() data: AddReactionWsDto,
    @ConnectedSocket() client: Socket,
  ) {
    const userId = this.socketUser.get(client.id);
    if (!userId) throw new WsException('Not authenticated');

    try {
      const action = await this.chatService.toggleReaction(
        data.messageId,
        userId,
        data.emoji,
      );

      this.server.to(`room:${data.roomId}`).emit('reaction_updated', {
        messageId: data.messageId,
        roomId: data.roomId,
        emoji: data.emoji,
        userId,
        action,
      });
    } catch (err: unknown) {
      client.emit('error', {
        code: 'REACTION_FAILED',
        message: err instanceof Error ? err.message : 'Failed to save reaction',
      });
    }
  }

  // ─── Message read receipt ────────────────────────────
  @SubscribeMessage('message_read')
  handleMessageRead(
    @MessageBody() data: { roomId: string; messageId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const userId = this.socketUser.get(client.id);
    if (!userId) return;

    client.to(`room:${data.roomId}`).emit('message_read', {
      userId,
      roomId: data.roomId,
      messageId: data.messageId,
    });
  }

  // ─── Public helpers for other services ───────────────

  /** Send a notification to a specific user across all their sockets */
  sendNotification(userId: string, payload: Record<string, unknown>) {
    this.server.to(`user:${userId}`).emit('notification', payload);
  }

  /** Broadcast a message to all members of a chat room */
  broadcastToRoom(roomId: string, event: string, payload: unknown) {
    this.server.to(`room:${roomId}`).emit(event, payload);
  }

  /** Broadcast an event to all sockets in a workspace room */
  broadcastToWorkspace(workspaceId: string, event: string, payload: unknown) {
    this.server.to(`workspace:${workspaceId}`).emit(event, payload);
  }

  /** Check whether a user has at least one active socket */
  isUserOnline(userId: string): boolean {
    return this.onlineUsers.has(userId);
  }

  /** Get all currently online user IDs */
  getOnlineUsers(): string[] {
    return Array.from(this.onlineUsers);
  }
}