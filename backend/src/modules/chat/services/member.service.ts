import { isSuperAdmin } from '../../../common/super-admin';
import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { ChatMember } from '../../../database/entities/chat-member.entity';
import { ErrorCode } from '../../../common/enums/error-code.enum';
import { CHAT_MEMBER_COLUMNS_SQL } from '../chat.sql';
import { RedisService } from '../../../redis/redis.service';
import { RedisKeys } from '../../../redis/redis.keys';

/**
 * What assertRoomMember caches: the fields an authorization decision reads,
 * and nothing else.
 *
 * Narrow on purpose. Caching the whole chat_members row would mean
 * last_read_seq — rewritten on every read receipt, several times a second in
 * a busy room — evicting an entry whose role and status never changed, which
 * is most of the cost of the cache for none of the benefit.
 */
export interface RoomMembership {
  id: string;
  roomId: string;
  userId: string;
  role: string;
  status: string;
}

const ROOM_MEMBERSHIP_TTL_SECONDS = 120;

@Injectable()
export class ChatMemberService {
  constructor(
    private readonly dataSource: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Gate for 29 call sites — every room read, every message send, every
   * settings lookup — so it ran more often than any other query in chat.
   *
   * Only the active-membership hit is cached. The pending-invite branch below
   * is a rare, informational path and stays uncached, which also means an
   * invite acceptance is visible immediately rather than after a TTL.
   */
  async assertRoomMember(
    roomId: string,
    userId: string,
  ): Promise<RoomMembership> {
    const superAdmin = isSuperAdmin(userId);
    // A group/channel blocked by an Optima admin is closed to everyone else.
    if (!superAdmin && (await this.isRoomBlocked(roomId)))
      throw new ForbiddenException({
        code: 'ROOM_BLOCKED',
        message: 'This chat has been blocked by Optima',
      });
    // A super admin who is in the room acts as its owner.
    const asOwner = (membership: RoomMembership) =>
      superAdmin ? { ...membership, role: 'owner' } : membership;

    const key = RedisKeys.roomMember(roomId, userId);
    const cached = await this.redis.getJson<RoomMembership>(key);
    if (cached) return asOwner(cached);

    const rows = await this.dataSource.query<RoomMembership>(
      `SELECT id, room_id AS "roomId", user_id AS "userId", role, status
       FROM chat_members
       WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL AND status = 'active'`,
      [roomId, userId],
    );
    if (rows[0]) {
      await this.redis.setJson(key, rows[0], ROOM_MEMBERSHIP_TTL_SECONDS);
      return asOwner(rows[0]);
    }
    // Ghost view: an Optima admin may look into any group/channel without
    // joining — no membership row, so nothing shows up in member lists, view
    // counts or "joined" notices. Sending still needs a real (visible) join.
    if (superAdmin) {
      const [room] = await this.dataSource.query<{ type: string }>(
        `SELECT type FROM chat_rooms WHERE id = $1`,
        [roomId],
      );
      if (room && room.type !== 'direct')
        return { id: 'ghost', roomId, userId, role: 'owner', status: 'active', ghost: true } as RoomMembership;
    }
    // Not active. Distinguish "invited, hasn't accepted" from "not involved
    // at all" so the client can offer the accept action.
    const pendingRows = await this.dataSource.query<ChatMember>(
      `SELECT ${CHAT_MEMBER_COLUMNS_SQL} FROM chat_members
       WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL AND status = 'pending'`,
      [roomId, userId],
    );
    if (pendingRows[0]) {
      throw new ForbiddenException({
        code: 'CHAT_INVITE_PENDING',
        message:
          'You have a pending invite to this room. Please accept it first.',
      });
    }
    throw new ForbiddenException({
      code: ErrorCode.NOT_ROOM_MEMBER,
      message: 'Not a member of this chat room',
    });
  }

  /** Whether an admin blocked this room (cached a minute; dropped on (un)block). */
  async isRoomBlocked(roomId: string): Promise<boolean> {
    const key = `room:blocked:${roomId}`;
    const cached = await this.redis.getJson<{ blocked: boolean }>(key);
    if (cached) return cached.blocked;
    const rows = await this.dataSource.query<{ blocked: boolean }>(
      `SELECT blocked_at IS NOT NULL AS blocked FROM chat_rooms WHERE id = $1`,
      [roomId],
    );
    const blocked = !!rows[0]?.blocked;
    await this.redis.setJson(key, { blocked }, 60);
    return blocked;
  }

  async forgetRoomBlocked(roomId: string) {
    await this.redis.drop(`room:blocked:${roomId}`);
  }

  /**
   * Drops cached room memberships. Every write to chat_members that changes
   * `role`, `status` or `left_at` has to call this — the volatile columns
   * (last_read_seq, is_muted) are deliberately not cached and need not.
   */
  async invalidateRoomMember(
    roomId: string,
    ...userIds: string[]
  ): Promise<void> {
    await this.redis.drop(
      ...userIds.map((id) => RedisKeys.roomMember(roomId, id)),
    );
  }

  async assertRoomMemberWithUser(
    roomId: string,
    userId: string,
  ): Promise<
    ChatMember & {
      role: string;
      isBanned: boolean;
      bannedUntil: string | null;
      user: {
        id: string;
        firstName: string;
        lastName: string;
        avatarUrl: string | null;
        publicId: string;
      };
    }
  > {
    const rows = await this.dataSource.query<any>(
      `SELECT
         cm.id AS "id", cm.room_id AS "roomId", cm.user_id AS "userId",
         cm.is_muted AS "isMuted", cm.muted_until AS "mutedUntil",
         cm.last_read_at AS "lastReadAt", cm.last_read_message_id AS "lastReadMessageId",
         cm.last_read_seq AS "lastReadSeq", cm.joined_at AS "joinedAt", cm.left_at AS "leftAt",
         cm.status AS "status", cm.role AS "role", cm.is_banned AS "isBanned", cm.banned_until AS "bannedUntil",
         u.id AS "u_id", u.first_name AS "u_firstName", u.last_name AS "u_lastName",
         u.avatar_url AS "u_avatarUrl", u.public_id::text AS "u_publicId"
       FROM chat_members cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.room_id = $1 AND cm.user_id = $2 AND cm.left_at IS NULL AND cm.status = 'active'`,
      [roomId, userId],
    );
    const row = rows[0];
    if (!row) {
      throw new ForbiddenException({
        code: ErrorCode.NOT_ROOM_MEMBER,
        message: 'Not a member of this chat room',
      });
    }
    const {
      u_id,
      u_firstName,
      u_lastName,
      u_avatarUrl,
      u_publicId,
      ...member
    } = row;
    return {
      ...member,
      user: {
        id: u_id,
        firstName: u_firstName,
        lastName: u_lastName,
        avatarUrl: u_avatarUrl,
        publicId: u_publicId,
      },
    };
  }

  /**
   * Persists how far into a room the calling member has read, by message id.
   * Monotonic (GREATEST) so an out-of-order/late "read" event for an older
   * message can never rewind a newer read position. Returns the resulting
   * seq so the caller can broadcast it — null if the message wasn't found in
   * this room (e.g. deleted) or the user isn't an active member.
   *
   * `status = 'active'` matters as much as `left_at IS NULL` here: a pending
   * invitee is a row in this table too, and without it they could move a read
   * cursor in a room they have not joined.
   */
  async markRead(
    roomId: string,
    userId: string,
    messageId: string,
  ): Promise<{ lastReadSeq: number } | null> {
    const rows = await this.dataSource.query(
      `UPDATE chat_members cm SET
         last_read_seq = GREATEST(cm.last_read_seq, m.sequence),
         last_read_message_id = CASE WHEN m.sequence >= cm.last_read_seq THEN m.id::varchar ELSE cm.last_read_message_id END,
         last_read_at = now()
       FROM chat_messages m
       WHERE cm.room_id = $1 AND cm.user_id = $2 AND cm.left_at IS NULL
         AND cm.status = 'active'
         AND m.id = $3 AND m.room_id = $1
       RETURNING cm.last_read_seq AS "lastReadSeq"`,
      [roomId, userId, messageId],
    );
    return rows[0] ?? null;
  }

  /**
   * Every active member's read position in a room (excluding the caller) -
   * used to render "read" checkmarks / "Seen by N" without a per-message
   * reads table, per the room's chat_members.last_read_seq column.
   */
  async getReadReceipts(
    roomId: string,
    userId: string,
  ): Promise<Array<{ userId: string; lastReadSeq: number }>> {
    await this.assertRoomMember(roomId, userId);
    return this.dataSource.query(
      `SELECT user_id AS "userId", last_read_seq AS "lastReadSeq"
       FROM chat_members
       WHERE room_id = $1 AND user_id != $2 AND left_at IS NULL AND status = 'active'`,
      [roomId, userId],
    );
  }

  /** Mute/unmute notifications for a room, for the calling member only. */
  async setMuted(
    roomId: string,
    userId: string,
    muted: boolean,
  ): Promise<{ isMuted: boolean }> {
    const rows = await this.dataSource.query(
      `UPDATE chat_members SET is_muted = $3
       WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL AND status = 'active'
       RETURNING is_muted AS "isMuted"`,
      [roomId, userId, muted],
    );
    if (!rows[0]) {
      throw new ForbiddenException({
        code: ErrorCode.NOT_ROOM_MEMBER,
        message: 'Not a member of this chat room',
      });
    }
    return rows[0];
  }

  /** Accept a pending chat invite (e.g. DM request) */
  async acceptChatInvite(
    roomId: string,
    userId: string,
  ): Promise<{ message: string }> {
    const rows = await this.dataSource.query<ChatMember>(
      `SELECT ${CHAT_MEMBER_COLUMNS_SQL} FROM chat_members
       WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL AND status = 'pending'`,
      [roomId, userId],
    );
    if (!rows[0]) {
      throw new NotFoundException({
        code: 'CHAT_INVITE_NOT_FOUND',
        message: 'No pending invite found for this room',
      });
    }
    await this.dataSource.query(
      `UPDATE chat_members SET status = 'active' WHERE room_id = $1 AND user_id = $2`,
      [roomId, userId],
    );
    await this.invalidateRoomMember(roomId, userId);

    // Notify the room creator
    const roomRows = await this.dataSource.query<any>(
      `SELECT created_by AS "createdById" FROM chat_rooms WHERE id = $1`,
      [roomId],
    );
    if (roomRows[0]?.createdById && roomRows[0].createdById !== userId) {
      await this.dataSource.query(
        `INSERT INTO notifications (user_id, actor_id, type, title, message, entity_type, entity_id)
         VALUES ($1, $2, 'chat_invite_accepted', 'Taklif qabul qilindi', 'Foydalanuvchi sizning chat taklifingizni qabul qildi', 'chat_room', $3)`,
        [roomRows[0].createdById, userId, roomId],
      );
    }

    return { message: 'Chat invite accepted' };
  }

  /** Decline a pending chat invite */
  async declineChatInvite(
    roomId: string,
    userId: string,
  ): Promise<{ message: string }> {
    const rows = await this.dataSource.query<ChatMember>(
      `SELECT ${CHAT_MEMBER_COLUMNS_SQL} FROM chat_members
       WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL AND status = 'pending'`,
      [roomId, userId],
    );
    if (!rows[0]) {
      throw new NotFoundException({
        code: 'CHAT_INVITE_NOT_FOUND',
        message: 'No pending invite found for this room',
      });
    }
    await this.dataSource.query(
      `UPDATE chat_members SET left_at = now() WHERE room_id = $1 AND user_id = $2`,
      [roomId, userId],
    );
    await this.invalidateRoomMember(roomId, userId);

    const roomRows = await this.dataSource.query<any>(
      `SELECT created_by AS "createdById" FROM chat_rooms WHERE id = $1`,
      [roomId],
    );
    if (roomRows[0]?.createdById && roomRows[0].createdById !== userId) {
      await this.dataSource.query(
        `INSERT INTO notifications (user_id, actor_id, type, title, message, entity_type, entity_id)
         VALUES ($1, $2, 'chat_invite_declined', 'Taklif rad etildi', 'Foydalanuvchi sizning chat taklifingizni rad etdi', 'chat_room', $3)`,
        [roomRows[0].createdById, userId, roomId],
      );
    }

    return { message: 'Chat invite declined' };
  }

  /** List all pending chat invites for a user across all rooms */
  async listPendingInvites(userId: string) {
    const rows = await this.dataSource.query<any>(
      `SELECT
         cm.room_id AS "roomId", r.name AS "roomName", r.type AS "roomType",
         r.scope, r.created_by AS "createdById",
         u.first_name AS "actorFirstName", u.last_name AS "actorLastName",
         u.avatar_url AS "actorAvatarUrl",
         cm.joined_at AS "invitedAt"
       FROM chat_members cm
       JOIN chat_rooms r ON r.id = cm.room_id
       JOIN users u ON u.id = r.created_by
       WHERE cm.user_id = $1 AND cm.left_at IS NULL AND cm.status = 'pending'`,
      [userId],
    );
    return rows;
  }
}
