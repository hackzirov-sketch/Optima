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
import { ViolationService } from '../moderation/services/violation.service';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { ChatMember } from '../../database/entities/chat-member.entity';

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

// ─── Meeting DTOs ──────────────────────────────────────
export interface MeetingJoinDto    { meetingId: string; }
export interface MeetingLeaveDto   { meetingId: string; }
export interface MeetingOfferDto   { meetingId: string; targetUserId: string; sdp: RTCSessionDescriptionInit; }
export interface MeetingAnswerDto  { meetingId: string; targetUserId: string; sdp: RTCSessionDescriptionInit; }
export interface MeetingIceDto     { meetingId: string; targetUserId: string; candidate: RTCIceCandidateInit; }
export interface MeetingToggleDto  { meetingId: string; kind: 'audio' | 'video' | 'screen'; enabled: boolean; }

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
  // userId → Set<workspaceId> — for scoped online/offline broadcasts
  private readonly userWorkspaces = new Map<string, Set<string>>();

  // ─── Meeting presence ─────────────────────────────────
  // meetingId → Map<userId, socketId>  (one socket per user per meeting)
  private readonly meetingUsers = new Map<string, Map<string, string>>();
  // socketId → meetingId  (for cleanup on disconnect)
  private readonly socketMeeting = new Map<string, string>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly chatService: ChatService,
    private readonly violationService: ViolationService,
    @InjectRepository(WorkspaceMember)
    private readonly wsMemberRepo: Repository<WorkspaceMember>,
    @InjectRepository(ChatMember)
    private readonly chatMemberRepo: Repository<ChatMember>,
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

    // Load workspace memberships → join scoped rooms + broadcast user_online
    const memberships = await this.wsMemberRepo.find({ where: { userId: user.id } });
    const wsIds = memberships.map((m) => m.workspaceId);
    this.userWorkspaces.set(user.id, new Set(wsIds));

    const onlineInMyWorkspaces = new Set<string>();
    for (const wsId of wsIds) {
      client.join(`workspace:${wsId}`);
      // Notify existing members in this workspace that user came online
      client.to(`workspace:${wsId}`).emit('user_online', { userId: user.id });
      // Collect already-online users who share this workspace
      for (const [uid, theirWsIds] of this.userWorkspaces) {
        if (uid !== user.id && theirWsIds.has(wsId)) {
          onlineInMyWorkspaces.add(uid);
        }
      }
    }

    // Send filtered online list only (workspace-scoped, not global)
    client.emit('online_users', { userIds: Array.from(onlineInMyWorkspaces) });

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
      // Broadcast offline only to workspace-scoped rooms (not globally)
      const wsIds = this.userWorkspaces.get(userId) ?? new Set<string>();
      for (const wsId of wsIds) {
        this.server.to(`workspace:${wsId}`).emit('user_offline', { userId });
      }
      this.userWorkspaces.delete(userId);
    }

    // Clean up meeting presence if this socket was in a meeting
    const meetingId = this.socketMeeting.get(client.id);
    if (meetingId && userId) {
      await this.leaveMeeting(client, userId, meetingId);
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
    if (!userId) throw new WsException({ code: 'WS_NOT_AUTHENTICATED', message: 'Not authenticated' });

    const member = await this.wsMemberRepo.findOne({
      where: { workspaceId: data.workspaceId, userId },
    });
    if (!member) throw new WsException({ code: 'WS_NOT_WORKSPACE_MEMBER', message: 'Not a workspace member' });

    client.join(`workspace:${data.workspaceId}`);
    return { event: 'workspace_joined', workspaceId: data.workspaceId };
  }

  @SubscribeMessage('leave_workspace')
  handleLeaveWorkspace(
    @MessageBody() data: { workspaceId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const userId = this.socketUser.get(client.id);
    if (!userId) throw new WsException({ code: 'WS_NOT_AUTHENTICATED', message: 'Not authenticated' });

    client.leave(`workspace:${data.workspaceId}`);
    return { event: 'workspace_left', workspaceId: data.workspaceId };
  }

  // ─── Room join/leave ──────────────────────────────────
  @SubscribeMessage('join_room')
  async handleJoinRoom(
    @MessageBody() data: JoinRoomDto,
    @ConnectedSocket() client: Socket,
  ) {
    const userId = this.socketUser.get(client.id);
    if (!userId) throw new WsException({ code: 'WS_NOT_AUTHENTICATED', message: 'Not authenticated' });

    const member = await this.chatMemberRepo.findOne({
      where: { roomId: data.roomId, userId },
    });
    if (!member) throw new WsException({ code: 'WS_NOT_ROOM_MEMBER', message: 'Not a room member' });

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
    if (!userId) throw new WsException({ code: 'WS_NOT_AUTHENTICATED', message: 'Not authenticated' });

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
    if (!client.rooms.has(`room:${data.roomId}`)) return;

    client.to(`room:${data.roomId}`).emit('typing', {
      userId,
      roomId: data.roomId,
      typing: data.typing,
    });
  }

  private async assertActiveUser(userId: string, client: Socket): Promise<boolean> {
    try {
      await this.violationService.assertNotBlocked(userId);
      return true;
    } catch (err: unknown) {
      const res = err instanceof Error && 'getResponse' in err
        ? (err as any).getResponse()
        : {};
      client.emit('error', {
        code: res?.code ?? 'ACCOUNT_SUSPENDED',
        message: res?.message ?? 'Account suspended',
      });
      return false;
    }
  }

  // ─── Send message ────────────────────────────────────
  @SubscribeMessage('send_message')
  async handleSendMessage(
    @MessageBody() data: SendMessageWsDto,
    @ConnectedSocket() client: Socket,
  ) {
    const userId = this.socketUser.get(client.id);
    if (!userId) throw new WsException({ code: 'WS_NOT_AUTHENTICATED', message: 'Not authenticated' });

    if (!await this.assertActiveUser(userId, client)) return;

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
    if (!userId) throw new WsException({ code: 'WS_NOT_AUTHENTICATED', message: 'Not authenticated' });

    if (!await this.assertActiveUser(userId, client)) return;

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
    if (!client.rooms.has(`room:${data.roomId}`)) return;

    client.to(`room:${data.roomId}`).emit('message_read', {
      userId,
      roomId: data.roomId,
      messageId: data.messageId,
    });
  }

  // ─── Meeting: join ───────────────────────────────────
  @SubscribeMessage('meeting:join')
  async handleMeetingJoin(
    @MessageBody() data: MeetingJoinDto,
    @ConnectedSocket() client: Socket,
  ) {
    const userId = this.socketUser.get(client.id);
    if (!userId) {
      client.emit('error', { code: 'WS_NOT_AUTHENTICATED', message: 'Not authenticated' });
      return;
    }

    const { meetingId } = data;

    // Leave any previous meeting this socket was in
    const prevMeeting = this.socketMeeting.get(client.id);
    if (prevMeeting && prevMeeting !== meetingId) {
      await this.leaveMeeting(client, userId, prevMeeting);
    }

    // Register in meeting presence map
    if (!this.meetingUsers.has(meetingId)) {
      this.meetingUsers.set(meetingId, new Map());
    }
    this.meetingUsers.get(meetingId)!.set(userId, client.id);
    this.socketMeeting.set(client.id, meetingId);

    await client.join(`meeting:${meetingId}`);

    // Tell the joiner who else is already in the meeting
    const participants = Array.from(this.meetingUsers.get(meetingId)!.entries())
      .filter(([uid]) => uid !== userId)
      .map(([uid]) => uid);

    client.emit('meeting:participants', { meetingId, userIds: participants });

    // Notify everyone else that this user joined
    client.to(`meeting:${meetingId}`).emit('meeting:user-joined', { meetingId, userId });

    this.logger.log(`User ${userId} joined meeting ${meetingId}`);
  }

  // ─── Meeting: leave ──────────────────────────────────
  @SubscribeMessage('meeting:leave')
  async handleMeetingLeave(
    @MessageBody() data: MeetingLeaveDto,
    @ConnectedSocket() client: Socket,
  ) {
    const userId = this.socketUser.get(client.id);
    if (!userId) return;
    await this.leaveMeeting(client, userId, data.meetingId);
  }

  // ─── Meeting: WebRTC offer ────────────────────────────
  @SubscribeMessage('meeting:offer')
  handleMeetingOffer(
    @MessageBody() data: MeetingOfferDto,
    @ConnectedSocket() client: Socket,
  ) {
    const userId = this.socketUser.get(client.id);
    if (!userId) return;

    const targetSocketId = this.meetingUsers.get(data.meetingId)?.get(data.targetUserId);
    if (!targetSocketId) return;

    this.server.to(targetSocketId).emit('meeting:offer', {
      meetingId: data.meetingId,
      fromUserId: userId,
      sdp: data.sdp,
    });
  }

  // ─── Meeting: WebRTC answer ───────────────────────────
  @SubscribeMessage('meeting:answer')
  handleMeetingAnswer(
    @MessageBody() data: MeetingAnswerDto,
    @ConnectedSocket() client: Socket,
  ) {
    const userId = this.socketUser.get(client.id);
    if (!userId) return;

    const targetSocketId = this.meetingUsers.get(data.meetingId)?.get(data.targetUserId);
    if (!targetSocketId) return;

    this.server.to(targetSocketId).emit('meeting:answer', {
      meetingId: data.meetingId,
      fromUserId: userId,
      sdp: data.sdp,
    });
  }

  // ─── Meeting: ICE candidate ───────────────────────────
  @SubscribeMessage('meeting:ice-candidate')
  handleMeetingIce(
    @MessageBody() data: MeetingIceDto,
    @ConnectedSocket() client: Socket,
  ) {
    const userId = this.socketUser.get(client.id);
    if (!userId) return;

    const targetSocketId = this.meetingUsers.get(data.meetingId)?.get(data.targetUserId);
    if (!targetSocketId) return;

    this.server.to(targetSocketId).emit('meeting:ice-candidate', {
      meetingId: data.meetingId,
      fromUserId: userId,
      candidate: data.candidate,
    });
  }

  // ─── Meeting: toggle audio / video / screen ───────────
  @SubscribeMessage('meeting:toggle')
  handleMeetingToggle(
    @MessageBody() data: MeetingToggleDto,
    @ConnectedSocket() client: Socket,
  ) {
    const userId = this.socketUser.get(client.id);
    if (!userId) return;

    client.to(`meeting:${data.meetingId}`).emit('meeting:toggled', {
      meetingId: data.meetingId,
      userId,
      kind: data.kind,
      enabled: data.enabled,
    });
  }

  // ─── Internal: clean up meeting state ────────────────
  private async leaveMeeting(client: Socket, userId: string, meetingId: string) {
    this.meetingUsers.get(meetingId)?.delete(userId);
    if (this.meetingUsers.get(meetingId)?.size === 0) {
      this.meetingUsers.delete(meetingId);
    }
    this.socketMeeting.delete(client.id);

    await client.leave(`meeting:${meetingId}`);
    client.to(`meeting:${meetingId}`).emit('meeting:user-left', { meetingId, userId });
    this.logger.log(`User ${userId} left meeting ${meetingId}`);
  }

  // ─── Public helpers for other services ───────────────

  /** Send a notification to a specific user across all their sockets */
  sendNotification(userId: string, payload: Record<string, unknown>) {
    this.server?.to(`user:${userId}`)?.emit('notification', payload);
  }

  /** Broadcast a message to all members of a chat room */
  broadcastToRoom(roomId: string, event: string, payload: unknown) {
    this.server?.to(`room:${roomId}`)?.emit(event, payload);
  }

  /** Broadcast an event to all sockets in a workspace room */
  broadcastToWorkspace(workspaceId: string, event: string, payload: unknown) {
    this.server?.to(`workspace:${workspaceId}`)?.emit(event, payload);
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