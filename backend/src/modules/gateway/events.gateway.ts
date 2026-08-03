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
import { Server, Socket, DefaultEventsMap } from 'socket.io';
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
import { ChatMemberService } from '../chat/services/member.service';
import {
  ChatPresenceService,
  PresenceStatus,
} from '../chat/services/presence.service';
import { ViolationService } from '../moderation/services/violation.service';
import { MeetingsService } from '../meetings/meetings.service';
import { UsersService } from '../users/services/users.service';
import { RedisService } from '../../redis/redis.service';
import { extractErrorDetails } from '../../common/utils/error.util';

/**
 * Everything this gateway hangs off a connection.
 *
 * Socket.IO types `socket.data` as `any` by default, which makes every
 * `client.data.userId` an untyped read — the compiler can't catch a typo or a
 * field that's only set on some paths. Threading this through `Socket<...>`
 * (see the `AppSocket` alias) makes the connection state a checked contract.
 */
export interface WsSocketData {
  /** Set once the handshake token verifies; absent means unauthenticated. */
  userId?: string;
  auth?: WsUser;
  /** Periodic re-validation timer, cleared on disconnect. */
  authTimer?: NodeJS.Timeout;
  /** Workspaces this socket joined rooms for, kept for disconnect cleanup. */
  workspaceIds?: string[];
  /** The meeting this socket is currently in, if any. */
  meetingId?: string;
}

/** A Socket with this gateway's `data` shape applied. */
export type AppSocket = Socket<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  WsSocketData
>;

/** The Server, likewise — otherwise fetchSockets() returns RemoteSockets
 * whose `data` falls back to `any` and the typing stops at the socket. */
export type AppServer = Server<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  WsSocketData
>;

/** Claims this gateway reads off an access token. */
interface AccessTokenPayload {
  sub: string;
  email: string;
  jti?: string;
  iat?: number;
  exp?: number;
  workspaceIds?: string[];
}

export interface WsUser {
  id: string;
  email: string;
  /** Access-token id, checked against the logout blacklist on revalidation. */
  jti?: string;
  /** Token issue time (epoch seconds), compared against a session-block cutoff. */
  iat?: number;
  /** Token expiry in epoch milliseconds; 0 when the token carried no `exp`. */
  expiresAt: number;
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
export interface MeetingJoinDto {
  meetingId: string;
}
export interface MeetingLeaveDto {
  meetingId: string;
}
export interface MeetingOfferDto {
  meetingId: string;
  targetUserId: string;
  sdp: RTCSessionDescriptionInit;
}
export interface MeetingAnswerDto {
  meetingId: string;
  targetUserId: string;
  sdp: RTCSessionDescriptionInit;
}
export interface MeetingIceDto {
  meetingId: string;
  targetUserId: string;
  candidate: RTCIceCandidateInit;
}
export interface MeetingToggleDto {
  meetingId: string;
  kind: 'audio' | 'video' | 'screen';
  enabled: boolean;
}
export interface DirectCallDto {
  meetingId: string;
  roomId: string;
  targetUserId: string;
  kind: 'audio' | 'video';
}

// A socket drop (network blip, tab refresh) shouldn't immediately count as
// "left the meeting" — give it a window to reconnect and rejoin before the
// participant is marked as having left in the DB (which can in turn trigger
// meeting auto-end if they were the last one present).
const MEETING_RECONNECT_GRACE_MS = 30_000;

// How often a live socket's handshake token is re-checked (expiry, logout
// blacklist, session block, account status). Short enough that a revoked
// session dies well inside the access token's own 20-minute lifetime, long
// enough that it costs one pipelined Redis round trip per socket per minute.
const WS_REVALIDATE_INTERVAL_MS = 60_000;

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
  server!: AppServer;

  private readonly logger = new Logger(EventsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly messageService: ChatMessageService,
    private readonly reactionService: ChatReactionService,
    private readonly memberService: ChatMemberService,
    private readonly presenceService: ChatPresenceService,
    private readonly violationService: ViolationService,
    private readonly dataSource: DatabaseService,
    private readonly usersService: UsersService,
    private readonly redisService: RedisService,
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
    const candidate = serverOrNamespace as Partial<Server> & {
      server?: Server;
    };
    const rootServer: Server =
      typeof candidate.adapter === 'function'
        ? serverOrNamespace
        : (candidate.server as Server);

    if (!rootServer || typeof rootServer.adapter !== 'function') {
      throw new Error('Could not resolve root Socket.IO server instance');
    }

    const url =
      this.configService.get<string>('redis.url') || 'redis://localhost:6379';
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
  private extractUser(client: AppSocket): WsUser | null {
    // Auth now lives in an httpOnly cookie (see auth-cookies.util.ts) — the
    // browser attaches it automatically on the handshake request as long as
    // the client connects with withCredentials:true, so there's nothing for
    // frontend JS to read or hand us explicitly anymore.
    const rawCookie = client.handshake.headers?.cookie;
    const token = rawCookie ? parseCookie(rawCookie)[ACCESS_COOKIE] : undefined;

    if (!token) return null;

    try {
      const secret = this.configService.get<string>('jwt.accessSecret');
      const payload = this.jwtService.verify<AccessTokenPayload>(token, {
        secret,
      });
      return {
        id: payload.sub,
        email: payload.email,
        jti: payload.jti,
        iat: payload.iat,
        expiresAt: payload.exp ? payload.exp * 1000 : 0,
        workspaceIds: payload.workspaceIds ?? [],
      };
    } catch {
      return null;
    }
  }

  /**
   * A socket authenticates once at handshake and then stays open for as long
   * as the client keeps it — days, in practice. Without this, the handshake
   * token's expiry never arrives, logout never reaches the socket, and neither
   * does a revoked session or a deactivated account: the connection outlives
   * every mechanism that is supposed to end it.
   *
   * Runs on a timer per socket (rather than per inbound event) so an idle
   * socket is dropped too — an attacker with a stolen cookie doesn't get to
   * hold a silent listener open indefinitely just by never sending anything.
   */
  private async revalidateSocket(client: AppSocket): Promise<boolean> {
    const auth = client.data?.auth;
    if (!auth) return false;

    if (auth.expiresAt && Date.now() >= auth.expiresAt) {
      this.disconnectUnauthorized(client, 'TOKEN_EXPIRED', 'Session expired');
      return false;
    }

    const [blacklisted, sessionBlockCutoff, cachedUser] =
      await this.redisService.validateTokenPipeline(auth.id, auth.jti);

    if (blacklisted) {
      this.disconnectUnauthorized(
        client,
        'TOKEN_REVOKED',
        'Token has been revoked',
      );
      return false;
    }
    if (
      sessionBlockCutoff !== null &&
      (auth.iat === undefined || auth.iat <= sessionBlockCutoff)
    ) {
      this.disconnectUnauthorized(
        client,
        'TOKEN_REVOKED',
        'All sessions have been revoked',
      );
      return false;
    }

    const user = cachedUser ?? (await this.usersService.findById(auth.id));
    if (!user || !user.isActive) {
      this.disconnectUnauthorized(
        client,
        'ACCOUNT_INACTIVE',
        'Account is inactive',
      );
      return false;
    }

    return true;
  }

  private disconnectUnauthorized(
    client: AppSocket,
    code: string,
    message: string,
  ) {
    client.emit('error', { code, message });
    client.disconnect(true);
  }

  async handleConnection(client: AppSocket) {
    const user = this.extractUser(client);

    if (!user) {
      this.logger.warn(`Unauthorized WS connection: ${client.id}`);
      client.emit('error', { message: 'Unauthorized', code: 'TOKEN_INVALID' });
      client.disconnect();
      return;
    }

    client.data.userId = user.id;
    client.data.auth = user;

    // Re-check the handshake token periodically for the rest of the socket's
    // life; cleared in handleDisconnect.
    client.data.authTimer = setInterval(() => {
      void this.revalidateSocket(client);
    }, WS_REVALIDATE_INTERVAL_MS);

    // Auto-join personal room for direct notifications. join/leave return a
    // promise once a (Redis) adapter is attached, and a rejected one here would
    // otherwise be unhandled.
    await client.join(`user:${user.id}`);

    // Load workspace memberships → join scoped rooms
    const memberships = await this.dataSource.query<{ workspaceId: string }>(
      `SELECT workspace_id AS "workspaceId" FROM workspace_members WHERE user_id = $1`,
      [user.id],
    );
    const wsIds = memberships.map((m) => m.workspaceId);

    // Store workspace memberships in socket data for cleanup on disconnect
    client.data.workspaceIds = wsIds;
    // Socket#join accepts an array and handles the adapter round trip itself.
    await client.join(wsIds.map((wsId) => `workspace:${wsId}`));

    // Redis presence: per-socket freshness tracking (self-healing against
    // orphaned entries from a dead process) - only the 0->1+ transition
    // actually flips status to online (see ChatPresenceService).
    const { status, isNewlyOnline } = await this.presenceService.connect(
      user.id,
      client.id,
    );
    if (isNewlyOnline) {
      wsIds.forEach((wsId) =>
        this.server.to(`workspace:${wsId}`).emit('presence_update', {
          userId: user.id,
          status: this.presenceService.maskForOthers(status),
        }),
      );
    }

    // Bulk presence snapshot for everyone in my workspaces, in one shot.
    const peerIds = new Set<string>();
    await Promise.all(
      wsIds.map(async (wsId) => {
        const sockets = await this.server
          .in(`workspace:${wsId}`)
          .fetchSockets();
        for (const s of sockets) {
          if (s.data?.userId && s.data.userId !== user.id)
            peerIds.add(s.data.userId);
        }
      }),
    );
    const snapshot = await this.presenceService.getPresenceBulk(
      Array.from(peerIds),
    );
    client.emit('presence_snapshot', { presence: snapshot });

    this.logger.log(`Client connected: ${client.id} → userId=${user.id}`);
  }

  @SubscribeMessage('heartbeat')
  async handleHeartbeat(@ConnectedSocket() client: AppSocket) {
    const userId = client.data?.userId;
    if (!userId) return;
    await this.presenceService.refresh(userId, client.id);
    // Cheap, already-debounced (30s) DB write - keeps users.last_seen fresh
    // for the "last seen" history column without hammering Postgres.
    void this.usersService.updateLastSeen(userId);
  }

  @SubscribeMessage('presence.set_status')
  async handleSetStatus(
    @MessageBody() data: { status: string },
    @ConnectedSocket() client: AppSocket,
  ) {
    const userId = client.data?.userId;
    if (!userId) return;
    const status = data.status as PresenceStatus;
    if (!Object.values(PresenceStatus).includes(status)) return;
    if (status === PresenceStatus.OFFLINE) return; // offline is derived, never set directly
    await this.presenceService.setStatus(userId, status);
    const wsIds: string[] = client.data?.workspaceIds || [];
    const masked = this.presenceService.maskForOthers(status);
    wsIds.forEach((wsId) =>
      this.server
        .to(`workspace:${wsId}`)
        .emit('presence_update', { userId, status: masked }),
    );
  }

  async handleDisconnect(client: AppSocket) {
    const authTimer = client.data?.authTimer;
    if (authTimer) {
      clearInterval(authTimer);
      delete client.data.authTimer;
    }

    const userId = client.data?.userId;
    if (!userId) return;

    // Removes just this socket's freshness entry (ChatPresenceService),
    // independent of Socket.IO's own room bookkeeping - unlike the old
    // fetchSockets-based check this replaced, there's no need to wait/guess
    // whether other tabs are still around: a multi-device user simply won't
    // hit isNowOffline until their last connection drops, and even a
    // never-cleaned-up entry (process crash) self-heals via its TTL.
    try {
      const { isNowOffline } = await this.presenceService.disconnect(
        userId,
        client.id,
      );
      if (isNowOffline) {
        void this.usersService.updateLastSeen(userId);
        const wsIds: string[] = client.data?.workspaceIds || [];
        for (const wsId of wsIds) {
          this.server.to(`workspace:${wsId}`).emit('presence_update', {
            userId,
            status: PresenceStatus.OFFLINE,
          });
        }
      }
    } catch (err) {
      this.logger.error(
        `Error during presence disconnect cleanup for ${userId}`,
        err,
      );
    }

    // Clean up meeting presence if this socket was in a meeting — but only
    // after a reconnect grace period (see MEETING_RECONNECT_GRACE_MS), not
    // immediately. Socket.IO already removes the disconnected socket from
    // all rooms synchronously, so the `meeting:${id}:user:${userId}` room
    // membership check below correctly reflects "no reconnect happened yet"
    // rather than this socket's own (already-gone) membership.
    const meetingId = client.data?.meetingId;
    if (meetingId) {
      setTimeout(() => {
        void this.finalizeMeetingLeaveAfterGrace(meetingId, userId);
      }, MEETING_RECONNECT_GRACE_MS);
    }

    this.logger.log(`Client disconnected: ${client.id} → userId=${userId}`);
  }

  /** Tail of handleDisconnect, run once the reconnect grace window expires. */
  private async finalizeMeetingLeaveAfterGrace(
    meetingId: string,
    userId: string,
  ) {
    try {
      const stillPresent = await this.server
        .in(`meeting:${meetingId}:user:${userId}`)
        .fetchSockets();
      if (stillPresent.length === 0) {
        await this.meetingsService.leave(meetingId, userId).catch(() => {});
        this.server
          .to(`meeting:${meetingId}`)
          .emit('meeting:user-left', { meetingId, userId });
        this.logger.log(
          `User ${userId} left meeting ${meetingId} (disconnect grace expired)`,
        );
      }
    } catch (err) {
      this.logger.error(`Error finalizing meeting leave for ${userId}`, err);
    }
  }

  // ─── Workspace join/leave ────────────────────────────
  @SubscribeMessage('join_workspace')
  async handleJoinWorkspace(
    @MessageBody() data: { workspaceId: string },
    @ConnectedSocket() client: AppSocket,
  ) {
    const userId = client.data?.userId;
    if (!userId)
      throw new WsException({
        code: 'WS_NOT_AUTHENTICATED',
        message: 'Not authenticated',
      });

    const memberRows = await this.dataSource.query(
      `SELECT id FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
      [data.workspaceId, userId],
    );
    const member = memberRows[0];
    if (!member)
      throw new WsException({
        code: 'WS_NOT_WORKSPACE_MEMBER',
        message: 'Not a workspace member',
      });

    await client.join(`workspace:${data.workspaceId}`);
    return { event: 'workspace_joined', workspaceId: data.workspaceId };
  }

  @SubscribeMessage('leave_workspace')
  async handleLeaveWorkspace(
    @MessageBody() data: { workspaceId: string },
    @ConnectedSocket() client: AppSocket,
  ) {
    const userId = client.data?.userId;
    if (!userId)
      throw new WsException({
        code: 'WS_NOT_AUTHENTICATED',
        message: 'Not authenticated',
      });

    await client.leave(`workspace:${data.workspaceId}`);
    return { event: 'workspace_left', workspaceId: data.workspaceId };
  }

  // ─── Room join/leave ──────────────────────────────────
  @SubscribeMessage('join_room')
  async handleJoinRoom(
    @MessageBody() data: JoinRoomDto,
    @ConnectedSocket() client: AppSocket,
  ) {
    const userId = client.data?.userId;
    if (!userId)
      throw new WsException({
        code: 'WS_NOT_AUTHENTICATED',
        message: 'Not authenticated',
      });

    const chatMemberRows = await this.dataSource.query(
      `SELECT id FROM chat_members WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [data.roomId, userId],
    );
    const member = chatMemberRows[0];
    if (!member)
      throw new WsException({
        code: 'WS_NOT_ROOM_MEMBER',
        message: 'Not a room member',
      });

    await client.join(`room:${data.roomId}`);
    client.to(`room:${data.roomId}`).emit('user_joined_room', {
      userId,
      roomId: data.roomId,
    });
    return { event: 'joined', roomId: data.roomId };
  }

  @SubscribeMessage('leave_room')
  async handleLeaveRoom(
    @MessageBody() data: JoinRoomDto,
    @ConnectedSocket() client: AppSocket,
  ) {
    const userId = client.data?.userId;
    if (!userId)
      throw new WsException({
        code: 'WS_NOT_AUTHENTICATED',
        message: 'Not authenticated',
      });

    await client.leave(`room:${data.roomId}`);
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
    @ConnectedSocket() client: AppSocket,
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

  /** Per-user (not per-IP/global) message send limit — see RedisService.checkChatMessageRateLimit. */
  private async assertMessageRateLimit(
    userId: string,
    client: AppSocket,
  ): Promise<boolean> {
    const { exceeded, retryAfterSeconds } =
      await this.redisService.checkChatMessageRateLimit(userId);
    if (exceeded) {
      client.emit('error', {
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Too many messages. Try again in ${retryAfterSeconds}s.`,
        retryAfterSeconds,
      });
      return false;
    }
    return true;
  }

  private async assertActiveUser(
    userId: string,
    client: AppSocket,
  ): Promise<boolean> {
    try {
      await this.violationService.assertNotBlocked(userId);
      return true;
    } catch (err) {
      client.emit(
        'error',
        extractErrorDetails(err, 'ACCOUNT_SUSPENDED', 'Account suspended'),
      );
      return false;
    }
  }

  // ─── Send message ────────────────────────────────────
  @SubscribeMessage('send_message')
  async handleSendMessage(
    @MessageBody() data: SendMessageWsDto,
    @ConnectedSocket() client: AppSocket,
  ) {
    const userId = client.data?.userId;
    if (!userId)
      throw new WsException({
        code: 'WS_NOT_AUTHENTICATED',
        message: 'Not authenticated',
      });

    if (!(await this.assertActiveUser(userId, client))) return;
    if (!(await this.assertMessageRateLimit(userId, client))) return;

    // Persist to DB — ChatMessageService checks room membership internally
    let saved: any;
    try {
      saved = await this.messageService.sendMessage(data.roomId, userId, {
        content: data.text,
        replyToId: data.replyToId,
        clientMessageId: data.clientMessageId, // idempotency: WS reconnect'da duplicate yo'q
        attachments: data.attachments,
      });
    } catch (err) {
      // ForbiddenException → emit error back to sender only
      client.emit(
        'error',
        extractErrorDetails(
          err,
          'SEND_MESSAGE_FAILED',
          'Failed to send message',
        ),
      );
      return;
    }

    // Broadcast saved message to everyone in the room (including sender)
    // saved.content is already plaintext (decrypted by ChatService.sendMessage)
    const messagePayload = {
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
    };
    this.server.to(`room:${data.roomId}`).emit('new_message', messagePayload);
    // Members only join `room:X` while that room is actually open, so a
    // room-only broadcast misses everyone browsing elsewhere (sidebar preview
    // and unread badges going stale until a manual reload). Every socket
    // auto-joins its own `user:<id>` on connect (see handleConnection), so
    // fan this out there too - that's what actually reaches a member
    // regardless of which room, if any, they currently have open.
    await this.broadcastToRoomMembers(
      data.roomId,
      'new_message',
      messagePayload,
    );

    return { event: 'message_sent', messageId: saved.id };
  }

  /** Emits an event to every active member's personal `user:<id>` channel — see handleSendMessage. */
  private async broadcastToRoomMembers(
    roomId: string,
    event: string,
    payload: unknown,
  ) {
    const members = await this.dataSource.query<{ userId: string }>(
      `SELECT user_id AS "userId" FROM chat_members WHERE room_id = $1 AND left_at IS NULL`,
      [roomId],
    );
    for (const { userId } of members) {
      this.server.to(`user:${userId}`).emit(event, payload);
    }
  }

  // ─── Thread reply (Slack-style, §14.13) — separate event so it never lands
  // in the main-timeline `new_message` stream (thread replies are hidden there). ──
  @SubscribeMessage('send_thread_reply')
  async handleSendThreadReply(
    @MessageBody() data: SendMessageWsDto & { threadRootId: string },
    @ConnectedSocket() client: AppSocket,
  ) {
    const userId = client.data?.userId;
    if (!userId)
      throw new WsException({
        code: 'WS_NOT_AUTHENTICATED',
        message: 'Not authenticated',
      });
    if (!(await this.assertActiveUser(userId, client))) return;
    if (!(await this.assertMessageRateLimit(userId, client))) return;

    let saved: any;
    try {
      saved = await this.messageService.sendThreadReply(
        data.threadRootId,
        userId,
        {
          content: data.text,
          clientMessageId: data.clientMessageId,
          attachments: data.attachments,
        },
      );
    } catch (err) {
      client.emit(
        'error',
        extractErrorDetails(
          err,
          'SEND_THREAD_REPLY_FAILED',
          'Failed to send thread reply',
        ),
      );
      return;
    }

    this.server.to(`room:${saved.roomId}`).emit('thread_reply', {
      threadRootId: data.threadRootId,
      threadReplyCount: saved.threadReplyCount ?? null,
      message: {
        id: saved.id,
        roomId: saved.roomId,
        senderId: saved.senderId,
        sequence: saved.sequence,
        clientMessageId: saved.clientMessageId,
        content: saved.content,
        contentType: saved.contentType ?? 'text',
        attachments: saved.attachments ?? [],
        replyToId: saved.replyToId ?? null,
        isThreadReply: true,
        isEdited: false,
        editedAt: null,
        createdAt: saved.createdAt,
        reactions: [],
        sender: saved.sender ?? null,
      },
    });

    return { event: 'thread_reply_sent', messageId: saved.id };
  }

  // ─── Message reaction ─────────────────────────────────
  @SubscribeMessage('add_reaction')
  async handleAddReaction(
    @MessageBody() data: AddReactionWsDto,
    @ConnectedSocket() client: AppSocket,
  ) {
    const userId = client.data?.userId;
    if (!userId)
      throw new WsException({
        code: 'WS_NOT_AUTHENTICATED',
        message: 'Not authenticated',
      });

    if (!(await this.assertActiveUser(userId, client))) return;

    try {
      // roomId comes back from the message row, not from `data` — otherwise a
      // member of room A could react there but have the event announced in
      // room B by naming it in the payload.
      const { action, roomId } = await this.reactionService.toggleReaction(
        data.messageId,
        userId,
        data.emoji,
      );

      this.server.to(`room:${roomId}`).emit('reaction_updated', {
        messageId: data.messageId,
        roomId,
        emoji: data.emoji,
        userId,
        action,
      });
    } catch (err) {
      client.emit(
        'error',
        extractErrorDetails(err, 'REACTION_FAILED', 'Failed to save reaction'),
      );
    }
  }

  // ─── Message read receipt ────────────────────────────
  @SubscribeMessage('message_read')
  async handleMessageRead(
    @MessageBody() data: { roomId: string; messageId: string },
    @ConnectedSocket() client: AppSocket,
  ) {
    const userId = client.data?.userId;
    if (!userId) return;
    // No client.rooms.has(...) socket-room gate here on purpose: join_room's
    // membership check is async, so a message_read sent right after join_room
    // (the normal case - see ChatPage's join-on-select effect) can arrive
    // before that join actually lands, and used to be silently dropped here,
    // leaving last_read_seq stuck at 0 forever. markRead's own WHERE clause
    // (room_id + user_id + left_at IS NULL) already enforces membership.

    // Persists the read position (chat_members.last_read_seq/last_read_message_id) -
    // without this the "read" checkmarks and unread counts revert on every
    // reload, since they're recomputed from this column, not from the socket
    // event itself.
    const result = await this.memberService.markRead(
      data.roomId,
      userId,
      data.messageId,
    );
    if (!result) return;

    const readPayload = {
      userId,
      roomId: data.roomId,
      messageId: data.messageId,
      lastReadSeq: result.lastReadSeq,
    };
    this.server.to(`room:${data.roomId}`).emit('message_read', readPayload);
    // Same reasoning as new_message: the sender may not have this room's
    // Socket.IO room joined right now (or at all), so the checkmark update
    // needs to reach their personal channel too, not just room:X.
    await this.broadcastToRoomMembers(data.roomId, 'message_read', readPayload);
  }

  // ─── Meeting: join ───────────────────────────────────
  @SubscribeMessage('meeting:join')
  async handleMeetingJoin(
    @MessageBody() data: MeetingJoinDto,
    @ConnectedSocket() client: AppSocket,
  ) {
    const userId = client.data?.userId;
    if (!userId) {
      client.emit('error', {
        code: 'WS_NOT_AUTHENTICATED',
        message: 'Not authenticated',
      });
      return;
    }

    const { meetingId } = data;
    if (!meetingId) {
      client.emit('meeting:error', {
        code: 'MEETING_ID_REQUIRED',
        message: 'meetingId is required',
      });
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
    } catch (err) {
      client.emit(
        'meeting:error',
        extractErrorDetails(
          err,
          'MEETING_JOIN_FAILED',
          'Could not join meeting',
        ),
      );
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

    client.emit('meeting:participants', {
      meetingId,
      userIds: Array.from(participants),
    });

    // Notify everyone else that this user joined
    client
      .to(`meeting:${meetingId}`)
      .emit('meeting:user-joined', { meetingId, userId });

    // Auto-presence: joining a call is a strong, unambiguous "in a meeting"
    // signal - no reason to make the user set this by hand.
    await this.presenceService.setStatus(userId, PresenceStatus.IN_MEETING);
    const wsIds: string[] = client.data?.workspaceIds || [];
    wsIds.forEach((wsId) =>
      this.server
        .to(`workspace:${wsId}`)
        .emit('presence_update', { userId, status: PresenceStatus.IN_MEETING }),
    );

    this.logger.log(`User ${userId} joined meeting ${meetingId}`);
  }

  // ─── Meeting: leave ──────────────────────────────────
  @SubscribeMessage('meeting:leave')
  async handleMeetingLeave(
    @MessageBody() data: MeetingLeaveDto,
    @ConnectedSocket() client: AppSocket,
  ) {
    const userId = client.data?.userId;
    if (!userId) return;
    await this.leaveMeeting(client, userId, data.meetingId);
  }

  // ─── Meeting: WebRTC offer ────────────────────────────
  @SubscribeMessage('meeting:offer')
  handleMeetingOffer(
    @MessageBody() data: MeetingOfferDto,
    @ConnectedSocket() client: AppSocket,
  ) {
    const userId = client.data?.userId;
    if (
      !userId ||
      client.data?.meetingId !== data.meetingId ||
      !client.rooms.has(`meeting:${data.meetingId}`)
    )
      return;

    this.server
      .to(`meeting:${data.meetingId}:user:${data.targetUserId}`)
      .emit('meeting:offer', {
        meetingId: data.meetingId,
        fromUserId: userId,
        sdp: data.sdp,
      });
  }

  // ─── Meeting: WebRTC answer ───────────────────────────
  @SubscribeMessage('meeting:answer')
  handleMeetingAnswer(
    @MessageBody() data: MeetingAnswerDto,
    @ConnectedSocket() client: AppSocket,
  ) {
    const userId = client.data?.userId;
    if (
      !userId ||
      client.data?.meetingId !== data.meetingId ||
      !client.rooms.has(`meeting:${data.meetingId}`)
    )
      return;

    this.server
      .to(`meeting:${data.meetingId}:user:${data.targetUserId}`)
      .emit('meeting:answer', {
        meetingId: data.meetingId,
        fromUserId: userId,
        sdp: data.sdp,
      });
  }

  // ─── Direct (1:1) audio/video call signaling (ported from main) ───────
  private callKey(meetingId: string) {
    return `call:${meetingId}`;
  }

  /**
   * Every field of a `call:*` payload is client-controlled, so nothing here may
   * be trusted on its own. Both parties must be live members of the room the
   * call claims to belong to — otherwise `call:invite` doubles as a
   * "ring any user on the platform" primitive, and the `roomId` it stores in
   * Redis flows into finalizeDirectCall -> createSystemMessage, which would let
   * a caller post into a room they were never in.
   */
  private async assertCallParties(
    roomId: string,
    callerId: string,
    calleeId: string,
  ): Promise<boolean> {
    if (!roomId || !callerId || !calleeId || callerId === calleeId)
      return false;
    const rows = await this.dataSource.query<{ userId: string }>(
      `SELECT user_id AS "userId" FROM chat_members
       WHERE room_id = $1 AND user_id = ANY($2::uuid[]) AND left_at IS NULL`,
      [roomId, [callerId, calleeId]],
    );
    return rows.length === 2;
  }

  /** Loads the Redis call state only if `userId` is one of its two parties. */
  private async getOwnCallState(
    meetingId: string,
    userId: string,
  ): Promise<Record<string, string> | null> {
    const redis = this.redisService.getClient();
    if (!redis || !meetingId) return null;
    const state = await redis.hgetall(this.callKey(meetingId));
    if (!state?.callerId) return null;
    if (state.callerId !== userId && state.calleeId !== userId) return null;
    return state;
  }

  @SubscribeMessage('call:invite')
  async handleDirectCallInvite(
    @MessageBody() data: DirectCallDto,
    @ConnectedSocket() client: AppSocket,
  ) {
    const userId = client.data?.userId;
    if (!userId || !data.meetingId || !data.roomId || !data.targetUserId)
      return;
    if (data.kind !== 'audio' && data.kind !== 'video') return;

    if (
      !(await this.assertCallParties(data.roomId, userId, data.targetUserId))
    ) {
      client.emit('call:error', {
        code: 'CALL_NOT_ROOM_MEMBER',
        message: 'Both participants must be members of this room',
      });
      return;
    }

    const redis = this.redisService.getClient();
    if (redis) {
      // NX: a meetingId already backing a live call belongs to whoever claimed
      // it first — a second inviter can't overwrite the parties on it.
      const claimed = await redis.hsetnx(
        this.callKey(data.meetingId),
        'callerId',
        userId,
      );
      if (!claimed) {
        client.emit('call:error', {
          code: 'CALL_ALREADY_ACTIVE',
          message: 'This call is already in progress',
        });
        return;
      }
      const pipeline = redis.pipeline();
      pipeline.hset(this.callKey(data.meetingId), {
        calleeId: data.targetUserId,
        roomId: data.roomId,
        kind: data.kind,
        startedAt: Date.now(),
      });
      pipeline.expire(this.callKey(data.meetingId), 3600);
      await pipeline.exec();
    }
    this.server.to(`user:${data.targetUserId}`).emit('call:incoming', {
      meetingId: data.meetingId,
      roomId: data.roomId,
      kind: data.kind,
      targetUserId: data.targetUserId,
      fromUserId: userId,
    });
  }

  @SubscribeMessage('call:accept')
  async handleDirectCallAccept(
    @MessageBody() data: DirectCallDto,
    @ConnectedSocket() client: AppSocket,
  ) {
    const userId = client.data?.userId;
    if (!userId) return;
    // Only the invited callee can accept, and only the caller gets told.
    const state = await this.getOwnCallState(data.meetingId, userId);
    if (!state || state.calleeId !== userId) return;

    const redis = this.redisService.getClient();
    if (redis)
      await redis.hset(this.callKey(data.meetingId), 'answeredAt', Date.now());
    this.server.to(`user:${state.callerId}`).emit('call:accepted', {
      meetingId: data.meetingId,
      roomId: state.roomId,
      kind: state.kind,
      fromUserId: userId,
    });
  }

  @SubscribeMessage('call:decline')
  async handleDirectCallDecline(
    @MessageBody() data: DirectCallDto,
    @ConnectedSocket() client: AppSocket,
  ) {
    const userId = client.data?.userId;
    if (!userId) return;
    const state = await this.getOwnCallState(data.meetingId, userId);
    if (!state) return;

    const peerId = state.callerId === userId ? state.calleeId : state.callerId;
    await this.finalizeDirectCall(data.meetingId, 'declined', userId);
    this.server.to(`user:${peerId}`).emit('call:declined', {
      meetingId: data.meetingId,
      roomId: state.roomId,
      kind: state.kind,
      fromUserId: userId,
    });
  }

  @SubscribeMessage('call:end')
  async handleDirectCallEnd(
    @MessageBody() data: DirectCallDto,
    @ConnectedSocket() client: AppSocket,
  ) {
    const userId = client.data?.userId;
    if (!userId) return;
    const state = await this.getOwnCallState(data.meetingId, userId);
    if (!state) return;

    const peerId = state.callerId === userId ? state.calleeId : state.callerId;
    await this.finalizeDirectCall(data.meetingId, 'ended', userId);
    this.server.to(`user:${peerId}`).emit('call:ended', {
      meetingId: data.meetingId,
      roomId: state.roomId,
      kind: state.kind,
      fromUserId: userId,
    });
  }

  /**
   * Writes the Telegram-style call outcome into the room's message history -
   * "Missed call" / "Declined call" / "Call ended · 3:24" - depending on
   * whether the callee ever accepted (answeredAt), read from the state
   * call:invite/call:accept wrote to Redis. Idempotent: the key is deleted
   * after the first finalize, so an accidental double-fire is a no-op.
   *
   * `actorId` must be one of the call's own parties — the roomId/callerId this
   * writes a message as come from Redis state, never from the socket payload,
   * so an outsider can neither end someone else's call nor have a message
   * attributed to a user in a room they don't belong to.
   */
  private async finalizeDirectCall(
    meetingId: string,
    reason: 'declined' | 'ended',
    actorId: string,
  ) {
    const redis = this.redisService.getClient();
    if (!redis) return;
    const state = await redis.hgetall(this.callKey(meetingId));
    if (!state.callerId) return;
    if (state.callerId !== actorId && state.calleeId !== actorId) return;
    await redis.del(this.callKey(meetingId));

    const { callerId, roomId, kind, answeredAt } = state;
    let systemMetadata: Record<string, unknown>;
    let content: string;
    if (answeredAt) {
      const durationSeconds = Math.max(
        0,
        Math.round((Date.now() - Number(answeredAt)) / 1000),
      );
      systemMetadata = { kind: 'call_ended', callType: kind, durationSeconds };
      content = `Call ended (${durationSeconds}s)`;
    } else {
      const outcomeKind =
        reason === 'declined' ? 'declined_call' : 'missed_call';
      systemMetadata = { kind: outcomeKind, callType: kind };
      content =
        outcomeKind === 'declined_call' ? 'Declined call' : 'Missed call';
    }

    try {
      const message = await this.messageService.createSystemMessage(
        roomId,
        callerId,
        content,
        'call',
        systemMetadata,
      );
      this.server.to(`room:${roomId}`).emit('new_message', message);
      await this.broadcastToRoomMembers(roomId, 'new_message', message);
    } catch (err) {
      this.logger.error(
        `Failed to record call outcome for meeting ${meetingId}`,
        err,
      );
    }
  }

  // ─── Meeting: ICE candidate ───────────────────────────
  @SubscribeMessage('meeting:ice-candidate')
  handleMeetingIce(
    @MessageBody() data: MeetingIceDto,
    @ConnectedSocket() client: AppSocket,
  ) {
    const userId = client.data?.userId;
    if (
      !userId ||
      client.data?.meetingId !== data.meetingId ||
      !client.rooms.has(`meeting:${data.meetingId}`)
    )
      return;

    this.server
      .to(`meeting:${data.meetingId}:user:${data.targetUserId}`)
      .emit('meeting:ice-candidate', {
        meetingId: data.meetingId,
        fromUserId: userId,
        candidate: data.candidate,
      });
  }

  // ─── Meeting: toggle audio / video / screen ───────────
  @SubscribeMessage('meeting:toggle')
  async handleMeetingToggle(
    @MessageBody() data: MeetingToggleDto,
    @ConnectedSocket() client: AppSocket,
  ) {
    const userId = client.data?.userId;
    if (
      !userId ||
      client.data?.meetingId !== data.meetingId ||
      !client.rooms.has(`meeting:${data.meetingId}`)
    )
      return;
    if (!['audio', 'video', 'screen'].includes(data.kind)) return;

    // Persist before announcing. A broadcast-only toggle left the DB saying
    // nobody was sharing while everyone's UI said otherwise, and gave screen
    // sharing no gate at all — see MeetingsService.setParticipantMedia.
    try {
      await this.meetingsService.setParticipantMedia(
        data.meetingId,
        userId,
        data.kind,
        data.enabled,
      );
    } catch (err) {
      client.emit(
        'meeting:error',
        extractErrorDetails(
          err,
          'MEETING_TOGGLE_FAILED',
          'Could not update media state',
        ),
      );
      return;
    }

    client.to(`meeting:${data.meetingId}`).emit('meeting:toggled', {
      meetingId: data.meetingId,
      userId,
      kind: data.kind,
      enabled: data.enabled,
    });
  }

  /** Host/co-host cutting another participant's screen share. */
  @SubscribeMessage('meeting:force-stop-share')
  async handleForceStopShare(
    @MessageBody() data: { meetingId: string; targetUserId: string },
    @ConnectedSocket() client: AppSocket,
  ) {
    const userId = client.data?.userId;
    if (!userId || !data?.meetingId || !data?.targetUserId) return;

    try {
      await this.meetingsService.forceStopScreenShare(
        data.meetingId,
        userId,
        data.targetUserId,
      );
    } catch (err) {
      client.emit(
        'meeting:error',
        extractErrorDetails(err, 'MEETING_HOST_ONLY', 'Not allowed'),
      );
      return;
    }

    this.server.to(`meeting:${data.meetingId}`).emit('meeting:toggled', {
      meetingId: data.meetingId,
      userId: data.targetUserId,
      kind: 'screen',
      enabled: false,
      stoppedBy: userId,
    });
  }

  // ─── Internal: clean up meeting state ────────────────
  private async leaveMeeting(
    client: AppSocket,
    userId: string,
    meetingId: string,
  ) {
    delete client.data.meetingId;
    await client.leave(`meeting:${meetingId}:user:${userId}`);
    await client.leave(`meeting:${meetingId}`);

    // Check if the user has any other sockets still in the meeting
    // (multiple tabs/devices) before marking them as left in the DB.
    const sockets = await this.server
      .in(`meeting:${meetingId}:user:${userId}`)
      .fetchSockets();
    if (sockets.length === 0) {
      // Persist leftAt so REST reads (participant list, capacity count,
      // host-leaves-ends-meeting logic) stay consistent with WS presence.
      // Swallow errors: the participant row may not exist if this socket
      // never completed a validated join (e.g. it disconnected mid-join).
      await this.meetingsService.leave(meetingId, userId).catch(() => {});
      client
        .to(`meeting:${meetingId}`)
        .emit('meeting:user-left', { meetingId, userId });
      this.logger.log(`User ${userId} left meeting ${meetingId}`);

      await this.presenceService.setStatus(userId, PresenceStatus.ONLINE);
      const wsIds: string[] = client.data?.workspaceIds || [];
      wsIds.forEach((wsId) =>
        this.server
          .to(`workspace:${wsId}`)
          .emit('presence_update', { userId, status: PresenceStatus.ONLINE }),
      );
    }
  }

  /** Server-side room cleanup after a host explicitly ends a meeting for everyone. */
  async forceEndMeetingRoom(meetingId: string) {
    const sockets = await this.server.in(`meeting:${meetingId}`).fetchSockets();
    for (const s of sockets) {
      delete s.data.meetingId;
      // RemoteSocket#leave is synchronous, unlike Socket#leave.
      s.leave(`meeting:${meetingId}`);
      if (s.data?.userId) s.leave(`meeting:${meetingId}:user:${s.data.userId}`);
    }
  }

  // ─── Public helpers for other services ───────────────

  /** Send a notification to a specific user across all their sockets */
  sendNotification(userId: string, payload: Record<string, unknown>) {
    this.server?.to(`user:${userId}`)?.emit('notification', payload);
  }

  /** Emit an arbitrary event to a specific user's personal channel across all their sockets */
  sendToUser(userId: string, event: string, payload: unknown) {
    this.server?.to(`user:${userId}`)?.emit(event, payload);
  }

  /**
   * Notify the meeting host + any co-hosts (e.g. a new waiting-room join
   * request).
   *
   * Callers treat this as fire-and-forget after the real work has already been
   * committed, so it must not reject: it hits the DB, and an unhandled
   * rejection from a background notify would take the process down (Node's
   * default) over an event nobody was waiting on.
   */
  async notifyMeetingHosts(meetingId: string, event: string, payload: unknown) {
    try {
      const rows = await this.dataSource.query<{ userId: string }>(
        `SELECT host_id AS "userId" FROM meetings WHERE id = $1
         UNION
         SELECT user_id AS "userId" FROM meeting_participants
         WHERE meeting_id = $1 AND role = 'co_host' AND left_at IS NULL`,
        [meetingId],
      );
      for (const { userId } of rows) {
        this.sendToUser(userId, event, payload);
      }
    } catch (err) {
      this.logger.error(`Failed to notify hosts of meeting ${meetingId}`, err);
    }
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

  /** Check how many sockets a user currently has open across the cluster. */
  async countUserSockets(userId: string): Promise<number> {
    const sockets = await this.server?.in(`user:${userId}`)?.fetchSockets();
    return sockets?.length ?? 0;
  }
}
