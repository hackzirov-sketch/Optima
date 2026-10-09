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
import { randomUUID } from 'crypto';
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
  /** Groups this socket joined rooms for, kept for disconnect cleanup. */
  groupIds?: string[];
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
  groupIds?: string[];
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
  groupIds: string[];
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
  /** Ciphertext for E2EE rooms (DMs, private groups/channels) — replaces `text` there. */
  e2ee?: unknown;
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
export interface MeetingReactionDto {
  meetingId: string;
  /** A single emoji character/sequence — validated below, never trusted raw. */
  emoji: string;
}
export interface MeetingHandDto {
  meetingId: string;
  raised: boolean;
}

// Emoji reactions are ephemeral fire-and-forget events — capped to a small
// allow-list (matching the picker in MeetingRoomPage.tsx) so the payload can
// never carry arbitrary text through what looks like an emoji field.
const ALLOWED_MEETING_REACTIONS = new Set(['👍', '❤️', '🎉', '👏', '😂', '😮']);

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
        groupIds: payload.groupIds ?? [],
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

    // extractUser only checks the token's signature and expiry. Everything
    // that can invalidate a still-unexpired token — logout blacklist, a
    // "revoke all sessions" cutoff, a deactivated account — lives in Redis and
    // was only consulted by the timer below, one full interval away. That left
    // a window in which a cookie captured before a logout could open a fresh
    // socket and listen for a minute. Run the same check once, up front.
    if (!(await this.revalidateSocket(client))) return;

    // Re-check the handshake token periodically for the rest of the socket's
    // life; cleared in handleDisconnect.
    client.data.authTimer = setInterval(() => {
      void this.revalidateSocket(client);
    }, WS_REVALIDATE_INTERVAL_MS);

    // Auto-join personal room for direct notifications. join/leave return a
    // promise once a (Redis) adapter is attached, and a rejected one here would
    // otherwise be unhandled.
    await client.join(`user:${user.id}`);

    // Load group memberships → join scoped rooms
    const memberships = await this.dataSource.query<{ groupId: string }>(
      `SELECT group_id AS "groupId" FROM group_members WHERE user_id = $1`,
      [user.id],
    );
    const groupIds = memberships.map((m) => m.groupId);

    // Store group memberships in socket data for cleanup on disconnect
    client.data.groupIds = groupIds;
    // Socket#join accepts an array and handles the adapter round trip itself.
    await client.join(groupIds.map((groupId) => `group:${groupId}`));

    // Redis presence: per-socket freshness tracking (self-healing against
    // orphaned entries from a dead process) - only the 0->1+ transition
    // actually flips status to online (see ChatPresenceService).
    const { status, isNewlyOnline } = await this.presenceService.connect(
      user.id,
      client.id,
    );
    if (isNewlyOnline) {
      groupIds.forEach((groupId) =>
        this.server.to(`group:${groupId}`).emit('presence_update', {
          userId: user.id,
          status: this.presenceService.maskForOthers(status),
        }),
      );
    }

    // Bulk presence snapshot for everyone in my groups, in one shot.
    const peerIds = new Set<string>();
    await Promise.all(
      groupIds.map(async (groupId) => {
        const sockets = await this.server.in(`group:${groupId}`).fetchSockets();
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
    const groupIds: string[] = client.data?.groupIds || [];
    const masked = this.presenceService.maskForOthers(status);
    groupIds.forEach((groupId) =>
      this.server
        .to(`group:${groupId}`)
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
        const groupIds: string[] = client.data?.groupIds || [];
        for (const groupId of groupIds) {
          this.server.to(`group:${groupId}`).emit('presence_update', {
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
    // Scheduled on the shared meeting-lifecycle queue rather than with an
    // in-process setTimeout. A timer only exists inside the worker that owns
    // it: a deploy, a crash or a scale-down between the disconnect and the end
    // of the grace window dropped it silently, and the participant stayed
    // "in the meeting" in Postgres forever — inflating the capacity count and
    // holding the meeting open against its own empty-room auto-end.
    const meetingId = client.data?.meetingId;
    if (meetingId) {
      await this.meetingsService
        .scheduleMeetingLeaveGrace(
          meetingId,
          userId,
          MEETING_RECONNECT_GRACE_MS,
        )
        .catch((err) =>
          this.logger.error(
            `Could not schedule leave grace for ${userId} in ${meetingId}`,
            err,
          ),
        );
    }

    this.logger.log(`Client disconnected: ${client.id} → userId=${userId}`);
  }

  /**
   * Tail of handleDisconnect, run by MeetingLifecycleProcessor once the
   * reconnect grace window expires (public because the processor calls it).
   */
  async finalizeMeetingLeaveAfterGrace(meetingId: string, userId: string) {
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

  // ─── Group join/leave ────────────────────────────
  @SubscribeMessage('join_group')
  async handleJoinGroup(
    @MessageBody() data: { groupId: string },
    @ConnectedSocket() client: AppSocket,
  ) {
    const userId = client.data?.userId;
    if (!userId)
      throw new WsException({
        code: 'WS_NOT_AUTHENTICATED',
        message: 'Not authenticated',
      });

    const memberRows = await this.dataSource.query(
      `SELECT id FROM group_members WHERE group_id = $1 AND user_id = $2`,
      [data.groupId, userId],
    );
    const member = memberRows[0];
    if (!member)
      throw new WsException({
        code: 'WS_NOT_GROUP_MEMBER',
        message: 'Not a group member',
      });

    await client.join(`group:${data.groupId}`);
    return { event: 'group_joined', groupId: data.groupId };
  }

  @SubscribeMessage('leave_group')
  async handleLeaveGroup(
    @MessageBody() data: { groupId: string },
    @ConnectedSocket() client: AppSocket,
  ) {
    const userId = client.data?.userId;
    if (!userId)
      throw new WsException({
        code: 'WS_NOT_AUTHENTICATED',
        message: 'Not authenticated',
      });

    await client.leave(`group:${data.groupId}`);
    return { event: 'group_left', groupId: data.groupId };
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

    // `status = 'active'` is the difference between "was invited" and "is in
    // the room". Without it, someone holding an unaccepted invite to a private
    // group or channel joined this socket room and received every message
    // broadcast to it from that moment on — the REST history is gated on
    // assertRoomMember (which does check status), so this was the one way in.
    const chatMemberRows = await this.dataSource.query(
      `SELECT id FROM chat_members
       WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL AND status = 'active'`,
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
        e2ee: data.e2ee as any,
      });
    } catch (err) {
      // ForbiddenException → emit error back to sender only
      const details = extractErrorDetails(
        err,
        'SEND_MESSAGE_FAILED',
        'Failed to send message',
      );
      client.emit('error', details);
      // Also answer the ack, so the client can react (E2EE re-key + retry)
      // instead of waiting for its timeout.
      return { ok: false, error: details };
    }

    await this.broadcastNewMessage(saved);

    // A plain object, not `{ event, ... }`: Nest emits an event-shaped return
    // value as a separate event and never calls the ack, which left every
    // client waiting out its 9s timeout and re-sending over REST.
    return { ok: true, messageId: saved.id };
  }

  /**
   * Fans a freshly saved message out to the open room and to every member's
   * personal channel. Shared by the socket path and the REST fallback (via
   * ChatRealtimeBridge), which used to reach nobody until they reloaded.
   * E2EE messages carry `content: null` and the ciphertext in `e2ee`.
   */
  async broadcastNewMessage(saved: any) {
    const messagePayload = {
      id: saved.id,
      roomId: saved.roomId,
      senderId: saved.senderId,
      sequence: saved.sequence,
      clientMessageId: saved.clientMessageId,
      content: saved.content,
      e2ee: saved.e2ee ?? null,
      contentType: saved.contentType ?? 'text',
      attachments: saved.attachments ?? [],
      replyToId: saved.replyToId ?? null,
      isEdited: false,
      editedAt: null,
      createdAt: saved.createdAt,
      reactions: [],
      sender: saved.sender ?? null,
    };
    this.server.to(`room:${saved.roomId}`).emit('new_message', messagePayload);
    // Members only join `room:X` while that room is actually open, so a
    // room-only broadcast misses everyone browsing elsewhere (sidebar preview
    // and unread badges going stale until a manual reload). Every socket
    // auto-joins its own `user:<id>` on connect (see handleConnection), so
    // fan this out there too - that's what actually reaches a member
    // regardless of which room, if any, they currently have open.
    await this.broadcastToRoomMembers(
      saved.roomId,
      'new_message',
      messagePayload,
    );
  }

  /** Emits an event to every active member's personal `user:<id>` channel — see handleSendMessage. */
  async broadcastToRoomMembers(
    roomId: string,
    event: string,
    payload: unknown,
  ) {
    // "Active member" in the sense this method's name claims: a pending
    // invitee has a chat_members row too, and this payload carries the message
    // body, so without the status filter an unaccepted invite delivered the
    // room's traffic straight to that user's personal channel.
    const members = await this.dataSource.query<{ userId: string }>(
      `SELECT user_id AS "userId" FROM chat_members
       WHERE room_id = $1 AND left_at IS NULL AND status = 'active'`,
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
          e2ee: data.e2ee as any,
        },
      );
    } catch (err) {
      const details = extractErrorDetails(
        err,
        'SEND_THREAD_REPLY_FAILED',
        'Failed to send thread reply',
      );
      client.emit('error', details);
      return { ok: false, error: details };
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
        e2ee: saved.e2ee ?? null,
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

    return { ok: true, messageId: saved.id };
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
        fatal: true,
      });
      return;
    }

    // Run the SAME validation + persistence path as the REST endpoint
    // (meeting exists, not ended/cancelled, caller is a group member,
    // capacity not exceeded) and write a meeting_participants row. Without
    // this, the socket would join a Socket.IO room for ANY meetingId with
    // zero checks, and no participant record would ever be created —
    // this was the root cause of "users can't join each other's meetings"
    // (the participant list / permission checks read from the DB, which
    // stayed empty because only the WS room existed).
    try {
      await this.meetingsService.join(meetingId, userId);
    } catch (err) {
      client.emit('meeting:error', {
        ...extractErrorDetails(
          err,
          'MEETING_JOIN_FAILED',
          'Could not join meeting',
        ),
        // Failing to join means there is no call to be in — this is the one
        // meeting:error the client should act on by tearing the room down.
        fatal: true,
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

    // Both payloads carry identities, not just ids.
    //
    // A tile used to appear only once a media stream arrived, and the name on
    // it was looked up in the viewer's group member list. So someone who
    // joined with their camera and microphone off was invisible to everyone
    // else — the room said "waiting for others" while they sat in it — and
    // anyone outside the viewer's group rendered as "Qatnashchi". The
    // roster is what the client draws from now, so it has to be complete.
    const profiles = await this.meetingsService.getParticipantProfiles([
      ...participants,
      userId,
    ]);
    const byId = new Map(profiles.map((profile) => [profile.id, profile]));

    client.emit('meeting:participants', {
      meetingId,
      userIds: Array.from(participants),
      participants: Array.from(participants).map((id) => ({
        userId: id,
        user: byId.get(id) ?? null,
      })),
    });

    // Reconnect/late-join snapshot of raised hands — without this, a host
    // who refreshes mid-call would lose the raised-hand list even though
    // the state itself is still live in Redis.
    const raisedHandUserIds =
      await this.meetingsService.listRaisedHands(meetingId);
    if (raisedHandUserIds.length) {
      client.emit('meeting:hands-snapshot', {
        meetingId,
        userIds: raisedHandUserIds,
      });
    }

    // Notify everyone else that this user joined
    client.to(`meeting:${meetingId}`).emit('meeting:user-joined', {
      meetingId,
      userId,
      user: byId.get(userId) ?? null,
    });

    // Auto-presence: joining a call is a strong, unambiguous "in a meeting"
    // signal - no reason to make the user set this by hand.
    await this.presenceService.setStatus(userId, PresenceStatus.IN_MEETING);
    const groupIds: string[] = client.data?.groupIds || [];
    groupIds.forEach((groupId) =>
      this.server
        .to(`group:${groupId}`)
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

  // ─── Meeting: reactions (emoji) ───────────────────────
  // Fully ephemeral — broadcast-only, nothing written to Postgres. Payload
  // shape (`{id, userId, emoji}`) matches what MeetingRoomPage.tsx's
  // onReaction already expects — the frontend had this wired up with no
  // server-side handler behind it.
  @SubscribeMessage('meeting:reaction')
  handleMeetingReaction(
    @MessageBody() data: MeetingReactionDto,
    @ConnectedSocket() client: AppSocket,
  ) {
    const userId = client.data?.userId;
    if (
      !userId ||
      client.data?.meetingId !== data.meetingId ||
      !client.rooms.has(`meeting:${data.meetingId}`) ||
      !ALLOWED_MEETING_REACTIONS.has(data.emoji)
    )
      return;

    this.server.to(`meeting:${data.meetingId}`).emit('meeting:reaction', {
      id: randomUUID(),
      userId,
      emoji: data.emoji,
    });
  }

  // ─── Meeting: raise/lower hand ─────────────────────────
  // Also ephemeral and broadcast-only: this is Meet/Zoom-style "hand raised"
  // — a visibility signal for the host, not a mic unlock. Actual mute state
  // still goes through `meeting:toggle` under the participant's own control;
  // the server here only relays who currently has a hand up.
  //
  // Cached in Redis (not just broadcast) so a host who refreshes mid-call —
  // the exact scenario this whole pass was about — doesn't lose the list of
  // raised hands; see the snapshot sent from handleMeetingJoin.
  @SubscribeMessage('meeting:hand')
  async handleMeetingHand(
    @MessageBody() data: MeetingHandDto,
    @ConnectedSocket() client: AppSocket,
  ) {
    const userId = client.data?.userId;
    if (
      !userId ||
      client.data?.meetingId !== data.meetingId ||
      !client.rooms.has(`meeting:${data.meetingId}`)
    )
      return;

    await this.meetingsService.setHandRaised(
      data.meetingId,
      userId,
      Boolean(data.raised),
    );

    this.server.to(`meeting:${data.meetingId}`).emit('meeting:hand', {
      userId,
      raised: Boolean(data.raised),
    });
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
       WHERE room_id = $1 AND user_id = ANY($2::uuid[])
         AND left_at IS NULL AND status = 'active'`,
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
      //
      // The claim and its expiry go out together. Claiming first and setting
      // the TTL in a later round trip leaves a window where a crash between
      // the two strands a key with no expiry at all, and since the claim is
      // NX, that meetingId can then never host a call again. EXPIRE is issued
      // unconditionally so it also refreshes the winner's key on a re-invite.
      const pipeline = redis.pipeline();
      pipeline.hsetnx(this.callKey(data.meetingId), 'callerId', userId);
      pipeline.expire(this.callKey(data.meetingId), 3600);
      const results = await pipeline.exec();
      const claimed = results?.[0]?.[1];
      if (!claimed) {
        client.emit('call:error', {
          code: 'CALL_ALREADY_ACTIVE',
          message: 'This call is already in progress',
        });
        return;
      }
      await redis.hset(this.callKey(data.meetingId), {
        calleeId: data.targetUserId,
        roomId: data.roomId,
        kind: data.kind,
        startedAt: Date.now(),
      });
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
      // Not fatal: a rejected toggle (someone else already sharing, a stale
      // participant row) leaves the call itself perfectly healthy. Emitting
      // this without the flag used to eject the caller from the meeting.
      client.emit('meeting:error', {
        ...extractErrorDetails(
          err,
          'MEETING_TOGGLE_FAILED',
          'Could not update media state',
        ),
        fatal: false,
      });
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
      client.emit('meeting:error', {
        ...extractErrorDetails(err, 'MEETING_HOST_ONLY', 'Not allowed'),
        fatal: false,
      });
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
      // A departed participant shouldn't linger in the raised-hands list —
      // best-effort clear, mirrors the resilience of the leave() call above.
      await this.meetingsService
        .setHandRaised(meetingId, userId, false)
        .catch(() => {});
      client
        .to(`meeting:${meetingId}`)
        .emit('meeting:user-left', { meetingId, userId });
      this.logger.log(`User ${userId} left meeting ${meetingId}`);

      // Only undo the status this gateway set itself when the call started.
      // An unconditional reset to ONLINE overwrote whatever the user had
      // deliberately chosen — do-not-disturb, away, invisible — so leaving a
      // call silently made an invisible user visible again.
      await this.restorePresenceAfterMeeting(client, userId);
    }
  }

  /** Clears IN_MEETING, leaving any manually chosen status alone. */
  private async restorePresenceAfterMeeting(client: AppSocket, userId: string) {
    const current = await this.presenceService.getStatus(userId);
    if (current !== PresenceStatus.IN_MEETING) return;

    await this.presenceService.setStatus(userId, PresenceStatus.ONLINE);
    const groupIds: string[] = client.data?.groupIds || [];
    groupIds.forEach((groupId) =>
      this.server
        .to(`group:${groupId}`)
        .emit('presence_update', { userId, status: PresenceStatus.ONLINE }),
    );
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

  /**
   * Broadcast to everyone currently in a meeting.
   *
   * Separate from broadcastToRoom because the two namespaces are different:
   * chat sockets join `room:<id>`, meeting sockets join `meeting:<id>` (see
   * handleMeetingJoin). Every meeting caller used to reach for broadcastToRoom
   * and pre-format the name as `meeting:<id>`, which that method then prefixed
   * again — so `meeting:ended`, `locked`, `file-shared` and the recording
   * events were all emitted into `room:meeting:<id>`, a room no socket is ever
   * in, and silently reached nobody.
   */
  broadcastToMeeting(meetingId: string, event: string, payload: unknown) {
    this.server?.to(`meeting:${meetingId}`)?.emit(event, payload);
  }

  /** Broadcast an event to all sockets in a group room */
  broadcastToGroup(groupId: string, event: string, payload: unknown) {
    this.server?.to(`group:${groupId}`)?.emit(event, payload);
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
