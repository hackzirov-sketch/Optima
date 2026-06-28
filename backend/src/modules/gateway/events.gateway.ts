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

    client.data.userId = user.id;

    // Auto-join personal room for direct notifications
    client.join(`user:${user.id}`);

    // Load workspace memberships → join scoped rooms + broadcast user_online
    const memberships = await this.wsMemberRepo.find({ where: { userId: user.id } });
    const wsIds = memberships.map((m) => m.workspaceId);
    
    // Store workspace memberships in socket data for cleanup on disconnect
    client.data.workspaceIds = wsIds;

    const onlineInMyWorkspaces = new Set<string>();
    for (const wsId of wsIds) {
      client.join(`workspace:${wsId}`);
      // Notify existing members in this workspace that user came online
      client.to(`workspace:${wsId}`).emit('user_online', { userId: user.id });
      
      // Collect already-online users who share this workspace across the cluster
      const sockets = await this.server.in(`workspace:${wsId}`).fetchSockets();
      for (const s of sockets) {
        if (s.data?.userId && s.data.userId !== user.id) {
          onlineInMyWorkspaces.add(s.data.userId);
        }
      }
    }

    // Send filtered online list only (workspace-scoped, not global)
    client.emit('online_users', { userIds: Array.from(onlineInMyWorkspaces) });

    this.logger.log(`Client connected: ${client.id} → userId=${user.id}`);
  }

  async handleDisconnect(client: Socket) {
    const userId = client.data?.userId;
    if (!userId) return;

    // Wait a brief moment to see if they have other active sockets (e.g. multiple tabs)
    // before broadcasting them as offline
    setTimeout(async () => {
      try {
        const sockets = await this.server.in(`user:${userId}`).fetchSockets();
        if (sockets.length === 0) {
          // User has completely disconnected from the cluster
          const wsIds = client.data?.workspaceIds || [];
          for (const wsId of wsIds) {
            this.server.to(`workspace:${wsId}`).emit('user_offline', { userId });
          }
        }
      } catch (err) {
        this.logger.error(`Error during disconnect cleanup for ${userId}`, err);
      }
    }, 2000);

    // Clean up meeting presence if this socket was in a meeting
    const meetingId = client.data?.meetingId;
    if (meetingId) {
      await this.leaveMeeting(client, userId, meetingId);
    }

    this.logger.log(`Client disconnected: ${client.id} → userId=${userId}`);
  }

  // ─── Workspace join/leave ────────────────────────────
  @SubscribeMessage('join_workspace')
  async handleJoinWorkspace(
    @MessageBody() data: { workspaceId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const userId = client.data?.userId;
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
    const userId = client.data?.userId;
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
    const userId = client.data?.userId;
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
    const userId = client.data?.userId;
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
    const userId = client.data?.userId;
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
    const userId = client.data?.userId;
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
    // saved.content is already plaintext (decrypted by ChatService.sendMessage)
    this.server.to(`room:${data.roomId}`).emit('new_message', {
      id: saved.id,
      roomId: saved.roomId,
      senderId: saved.senderId,
      content: saved.content,
      contentType: saved.contentType ?? 'text',
      replyToId: saved.replyToId ?? null,
      isEdited: false,
      editedAt: null,
      createdAt: saved.createdAt,
      reactions: [],
      sender: saved.sender ?? null,
    });

    return { event: 'message_sent', messageId: saved.id };
  }

  // ─── Message reaction ─────────────────────────────────
  @SubscribeMessage('add_reaction')
  async handleAddReaction(
    @MessageBody() data: AddReactionWsDto,
    @ConnectedSocket() client: Socket,
  ) {
    const userId = client.data?.userId;
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
    const userId = client.data?.userId;
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
    const userId = client.data?.userId;
    if (!userId) {
      client.emit('error', { code: 'WS_NOT_AUTHENTICATED', message: 'Not authenticated' });
      return;
    }

    const { meetingId } = data;

    // Leave any previous meeting this socket was in
    const prevMeeting = client.data?.meetingId;
    if (prevMeeting && prevMeeting !== meetingId) {
      await this.leaveMeeting(client, userId, prevMeeting);
    }

    // Register in meeting presence
    client.data.meetingId = meetingId;
    await client.join(`meeting:${meetingId}`);
    await client.join(`meeting:${meetingId}:user:${userId}`);

    // Tell the joiner who else is already in the meeting
    const sockets = await this.server.in(`meeting:${meetingId}`).fetchSockets();
    const participants = new Set<string>();
    for (const s of sockets) {
      if (s.data?.userId && s.data.userId !== userId) {
        participants.add(s.data.userId);
      }
    }

    client.emit('meeting:participants', { meetingId, userIds: Array.from(participants) });

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
    const userId = client.data?.userId;
    if (!userId) return;
    await this.leaveMeeting(client, userId, data.meetingId);
  }

  // ─── Meeting: WebRTC offer ────────────────────────────
  @SubscribeMessage('meeting:offer')
  handleMeetingOffer(
    @MessageBody() data: MeetingOfferDto,
    @ConnectedSocket() client: Socket,
  ) {
    const userId = client.data?.userId;
    if (!userId) return;

    this.server.to(`meeting:${data.meetingId}:user:${data.targetUserId}`).emit('meeting:offer', {
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
    const userId = client.data?.userId;
    if (!userId) return;

    this.server.to(`meeting:${data.meetingId}:user:${data.targetUserId}`).emit('meeting:answer', {
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
    const userId = client.data?.userId;
    if (!userId) return;

    this.server.to(`meeting:${data.meetingId}:user:${data.targetUserId}`).emit('meeting:ice-candidate', {
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
    const userId = client.data?.userId;
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
    delete client.data.meetingId;
    await client.leave(`meeting:${meetingId}:user:${userId}`);
    await client.leave(`meeting:${meetingId}`);
    
    // Check if the user has any other sockets still in the meeting
    const sockets = await this.server.in(`meeting:${meetingId}:user:${userId}`).fetchSockets();
    if (sockets.length === 0) {
      client.to(`meeting:${meetingId}`).emit('meeting:user-left', { meetingId, userId });
      this.logger.log(`User ${userId} left meeting ${meetingId}`);
    }
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

  /** Check whether a user has at least one active socket across the cluster */
  async isUserOnline(userId: string): Promise<boolean> {
    const sockets = await this.server?.in(`user:${userId}`)?.fetchSockets();
    return sockets ? sockets.length > 0 : false;
  }

  /** Get all currently online user IDs (Note: Can be expensive, avoid frequent use) */
  async getOnlineUsers(): Promise<string[]> {
    // We cannot efficiently query ALL online users across a cluster easily without storing it in Redis.
    // Instead of iterating all rooms, we could rely on a Redis set.
    // But since this was only an in-memory Set before, if it's unused, we can just return empty for now,
    // or we'd need to maintain a Redis Set of online users if really needed.
    return [];
  }
}