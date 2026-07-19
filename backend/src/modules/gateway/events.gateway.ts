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
import { Logger, Injectable, Inject, forwardRef } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { parseCookie } from 'cookie';
import { ACCESS_COOKIE } from '../../common/utils/auth-cookies.util';
import { ChatMessageService } from '../chat/services/message.service';
import { ChatReactionService } from '../chat/services/reaction.service';
import { ViolationService } from '../moderation/services/violation.service';
import { MeetingsService } from '../meetings/meetings.service';

export interface WsUser {
  id: string;
  email: string;
  workspaceIds: string[];
}

// ─── DTOs ──────────────────────────────────────────────
export interface SendMessageWsDto {
  roomId: string;
  text?: string;
  replyToId?: string;
  clientMessageId?: string; // idempotency — WS reconnect'da duplicate oldini olish
  /** Pre-uploaded files. Client must call /chat/rooms/:roomId/attachments/presign first. */
  attachments?: Array<{
    storageKey: string;
    storageUrl: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    width?: number;
    height?: number;
  }>;
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
export interface DirectCallDto { meetingId: string; roomId: string; targetUserId: string; kind: 'audio' | 'video'; }

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
    private readonly messageService: ChatMessageService,
    private readonly reactionService: ChatReactionService,
    private readonly violationService: ViolationService,
    private readonly dataSource: DatabaseService,
    @Inject(forwardRef(() => MeetingsService))
    private readonly meetingsService: MeetingsService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway initialized ✅');
    this.attachRedisAdapter(server).catch((err) => {
      this.logger.warn(
        `Socket.IO Redis adapter skipped (Redis unavailable): ${
          err instanceof Error ? err.message : err
        }`,
      );
    });
  }

  // Attach Redis adapter so Socket.IO events are broadcast across
  // all Node processes / PM2 cluster / Docker replicas. Runs here
  // (afterInit) rather than in a module's onModuleInit, since `server`
  // is only guaranteed to be set once Socket.IO has finished initializing
  // the gateway — attaching earlier silently no-ops with "adapter is not
  // a function".
  private async attachRedisAdapter(serverOrNamespace: Server): Promise<void> {
    // NestJS passes the Namespace object (not the root Server) to afterInit
    // when `namespace` is explicitly set in @WebSocketGateway options.
    // Namespace instances don't have .adapter() — only the root Server does,
    // accessible via Namespace#server.
    const rootServer: Server =
      typeof (serverOrNamespace as any).adapter === 'function'
        ? serverOrNamespace
        : (serverOrNamespace as any).server;

    if (!rootServer || typeof rootServer.adapter !== 'function') {
      throw new Error('Could not resolve root Socket.IO server instance');
    }

    const url = this.configService.get<string>('redis.url') || 'redis://localhost:6379';
    const password = this.configService.get<string>('redis.password');

    const pubClient = new Redis(url, {
      password: password || undefined,
      maxRetriesPerRequest: 2,
      lazyConnect: false,
    });
    const subClient = pubClient.duplicate();

    await Promise.all([
      new Promise<void>((res, rej) => {
        pubClient.once('ready', res);
        pubClient.once('error', rej);
      }),
      new Promise<void>((res, rej) => {
        subClient.once('ready', res);
        subClient.once('error', rej);
      }),
    ]);

    rootServer.adapter(createAdapter(pubClient, subClient));
    this.logger.log('Socket.IO Redis adapter attached ✅');
  }

  // ─── Auth middleware ─────────────────────────────────
  private extractUser(client: Socket): WsUser | null {
    // Auth now lives in an httpOnly cookie (see auth-cookies.util.ts) — the
    // browser attaches it automatically on the handshake request as long as
    // the client connects with withCredentials:true, so there's nothing for
    // frontend JS to read or hand us explicitly anymore.
    const rawCookie = client.handshake.headers?.cookie;
    const token = rawCookie ? parseCookie(rawCookie)[ACCESS_COOKIE] : undefined;

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
    const memberships: Array<{ workspaceId: string }> = await this.dataSource.query(
      `SELECT workspace_id AS "workspaceId" FROM workspace_members WHERE user_id = $1`,
      [user.id],
    );
    const wsIds = memberships.map((m) => m.workspaceId);
    
    // Store workspace memberships in socket data for cleanup on disconnect
    client.data.workspaceIds = wsIds;

    // Parallel: har workspace uchun fetchSockets'ni bir vaqtda chaqiramiz
    const onlineInMyWorkspaces = new Set<string>();
    await Promise.all(
      wsIds.map(async (wsId) => {
        client.join(`workspace:${wsId}`);
        client.to(`workspace:${wsId}`).emit('user_online', { userId: user.id });

        const sockets = await this.server.in(`workspace:${wsId}`).fetchSockets();
        for (const s of sockets) {
          if (s.data?.userId && s.data.userId !== user.id) {
            onlineInMyWorkspaces.add(s.data.userId);
          }
        }
      }),
    );

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

    const memberRows = await this.dataSource.query(
      `SELECT id FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
      [data.workspaceId, userId],
    );
    const member = memberRows[0];
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

    const chatMemberRows = await this.dataSource.query(
      `SELECT id FROM chat_members WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [data.roomId, userId],
    );
    const member = chatMemberRows[0];
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

    // Persist to DB — ChatMessageService checks room membership internally
    let saved: any;
    try {
      saved = await this.messageService.sendMessage(data.roomId, userId, {
        content: data.text,
        replyToId: data.replyToId,
        clientMessageId: data.clientMessageId, // idempotency: WS reconnect'da duplicate yo'q
        attachments: data.attachments,
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
      sequence: saved.sequence,
      clientMessageId: saved.clientMessageId,
      content: saved.content,
      contentType: saved.contentType ?? 'text',
      attachments: saved.attachments ?? [],
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
      const action = await this.reactionService.toggleReaction(
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
    if (!meetingId) {
      client.emit('meeting:error', { code: 'MEETING_ID_REQUIRED', message: 'meetingId is required' });
      return;
    }

    // Run the SAME validation + persistence path as the REST endpoint
    // (meeting exists, not ended/cancelled, caller is a workspace member,
    // capacity not exceeded) and write a meeting_participants row. Without
    // this, the socket would join a Socket.IO room for ANY meetingId with
    // zero checks, and no participant record would ever be created —
    // this was the root cause of "users can't join each other's meetings"
    // (the participant list / permission checks read from the DB, which
    // stayed empty because only the WS room existed).
    try {
      await this.meetingsService.join(meetingId, userId);
    } catch (err: any) {
      const response = typeof err?.getResponse === 'function' ? err.getResponse() : null;
      client.emit('meeting:error', {
        code: response?.code ?? 'MEETING_JOIN_FAILED',
        message: response?.message ?? 'Could not join meeting',
      });
      return;
    }

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
    if (!userId || client.data?.meetingId !== data.meetingId || !client.rooms.has(`meeting:${data.meetingId}`)) return;

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
    if (!userId || client.data?.meetingId !== data.meetingId || !client.rooms.has(`meeting:${data.meetingId}`)) return;

    this.server.to(`meeting:${data.meetingId}:user:${data.targetUserId}`).emit('meeting:answer', {
      meetingId: data.meetingId,
      fromUserId: userId,
      sdp: data.sdp,
    });
  }

  // ─── Direct (1:1) audio/video call signaling (ported from main) ───────
  @SubscribeMessage('call:invite')
  handleDirectCallInvite(@MessageBody() data: DirectCallDto, @ConnectedSocket() client: Socket) {
    const userId = client.data?.userId;
    if (!userId || !data.meetingId || !data.roomId || !data.targetUserId) return;
    this.server.to(`user:${data.targetUserId}`).emit('call:incoming', { ...data, fromUserId: userId });
  }

  @SubscribeMessage('call:accept')
  handleDirectCallAccept(@MessageBody() data: DirectCallDto, @ConnectedSocket() client: Socket) {
    const userId = client.data?.userId;
    if (!userId) return;
    this.server.to(`user:${data.targetUserId}`).emit('call:accepted', { ...data, fromUserId: userId });
  }

  @SubscribeMessage('call:decline')
  handleDirectCallDecline(@MessageBody() data: DirectCallDto, @ConnectedSocket() client: Socket) {
    const userId = client.data?.userId;
    if (!userId) return;
    this.server.to(`user:${data.targetUserId}`).emit('call:declined', { ...data, fromUserId: userId });
  }

  @SubscribeMessage('call:end')
  handleDirectCallEnd(@MessageBody() data: DirectCallDto, @ConnectedSocket() client: Socket) {
    const userId = client.data?.userId;
    if (!userId) return;
    this.server.to(`user:${data.targetUserId}`).emit('call:ended', { ...data, fromUserId: userId });
  }

  // ─── Meeting: ICE candidate ───────────────────────────
  @SubscribeMessage('meeting:ice-candidate')
  handleMeetingIce(
    @MessageBody() data: MeetingIceDto,
    @ConnectedSocket() client: Socket,
  ) {
    const userId = client.data?.userId;
    if (!userId || client.data?.meetingId !== data.meetingId || !client.rooms.has(`meeting:${data.meetingId}`)) return;

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
    if (!userId || client.data?.meetingId !== data.meetingId || !client.rooms.has(`meeting:${data.meetingId}`)) return;

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
    // (multiple tabs/devices) before marking them as left in the DB.
    const sockets = await this.server.in(`meeting:${meetingId}:user:${userId}`).fetchSockets();
    if (sockets.length === 0) {
      // Persist leftAt so REST reads (participant list, capacity count,
      // host-leaves-ends-meeting logic) stay consistent with WS presence.
      // Swallow errors: the participant row may not exist if this socket
      // never completed a validated join (e.g. it disconnected mid-join).
      await this.meetingsService.leave(meetingId, userId).catch(() => {});
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
