import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../../database/database.service';
import { RedisService } from '../../redis/redis.service';
import { RedisKeys } from '../../redis/redis.keys';
import { ChatMemberService } from '../chat/services/member.service';
import { isSuperAdmin } from '../../common/super-admin';

const PRESENCE_FRESH_MS = 90_000;
const page = (value?: string) => Math.max(1, Math.min(500, Number(value) || 1));

/**
 * The Optima admin panel's backend. Blocking never deletes anything: an
 * account is switched off (is_active = false) and signed out everywhere; a
 * group or channel is closed to everyone but admins. Every change is written
 * to admin_audit.
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
    private readonly members: ChatMemberService,
    private readonly events: EventEmitter2,
  ) {}

  private audit(actorId: string, action: string, targetType: string, targetId: string | null, details: Record<string, unknown> = {}) {
    return this.db.query(
      `INSERT INTO admin_audit (actor_id, action, target_type, target_id, details) VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [actorId, action, targetType, targetId, JSON.stringify(details)],
    );
  }

  /** People with a live connection right now (fresh presence heartbeats). */
  async onlineUserIds(): Promise<string[]> {
    const client = this.redis.getClient();
    if (!client) return [];
    const ids: string[] = [];
    let cursor = '0';
    const now = Date.now();
    do {
      const [next, keys] = await client.scan(cursor, 'MATCH', 'presence:user:*:sockets', 'COUNT', 500);
      cursor = next;
      for (const key of keys) {
        const sockets = await client.hgetall(key);
        if (Object.values(sockets).some((ts) => now - Number(ts) < PRESENCE_FRESH_MS))
          ids.push(key.slice('presence:user:'.length, -':sockets'.length));
      }
    } while (cursor !== '0');
    return ids;
  }

  async overview() {
    const [online, [users], [rooms], [meetings], [requests], [ai]] = await Promise.all([
      this.onlineUserIds(),
      this.db.query<Record<string, number>>(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE blocked_at IS NOT NULL)::int AS blocked,
                count(*) FILTER (WHERE created_at > now() - interval '1 day')::int AS "newToday",
                count(*) FILTER (WHERE last_seen > now() - interval '1 day')::int AS "activeToday"
           FROM users WHERE deleted_at IS NULL`,
      ),
      this.db.query<Record<string, number>>(
        `SELECT count(*) FILTER (WHERE type = 'group')::int AS groups,
                count(*) FILTER (WHERE type = 'channel')::int AS channels,
                count(*) FILTER (WHERE type = 'direct')::int AS direct,
                count(*) FILTER (WHERE blocked_at IS NOT NULL)::int AS blocked
           FROM chat_rooms`,
      ),
      this.db.query<Record<string, number>>(
        `SELECT count(*) FILTER (WHERE status = 'live')::int AS live,
                (SELECT count(*)::int FROM meeting_participants p JOIN meetings m ON m.id = p.meeting_id
                  WHERE p.left_at IS NULL AND m.status = 'live') AS "inCalls"
           FROM meetings`,
      ),
      this.db.query<Record<string, number>>(
        `SELECT (SELECT count(*)::int FROM chat_join_requests) AS chat,
                (SELECT count(*)::int FROM meeting_join_requests WHERE status = 'pending') AS meeting`,
      ),
      this.db.query<Record<string, number>>(
        `SELECT count(*)::int AS "messagesToday" FROM ai_messages WHERE role = 'user' AND created_at > now() - interval '1 day'`,
      ),
    ]);
    return { onlineNow: online.length, users, rooms, meetings, requests, ai };
  }

  async users(query = '', pageParam?: string, filter?: string) {
    const p = page(pageParam);
    const search = query.trim();
    const online = new Set(await this.onlineUserIds());
    const where = [`u.deleted_at IS NULL`];
    const params: unknown[] = [];
    if (search) {
      params.push(`%${search}%`);
      where.push(`(u.first_name ILIKE $${params.length} OR u.last_name ILIKE $${params.length} OR u.username ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
    }
    if (filter === 'blocked') where.push(`u.blocked_at IS NOT NULL`);
    if (filter === 'online') {
      params.push([...online]);
      where.push(`u.id = ANY($${params.length}::uuid[])`);
    }
    params.push(50, (p - 1) * 50);
    const rows = await this.db.query<Record<string, unknown> & { id: string }>(
      `SELECT u.id, u.first_name AS "firstName", u.last_name AS "lastName", u.username, u.email,
              u.avatar_url AS "avatarUrl", u.created_at AS "createdAt", u.last_seen AS "lastSeen",
              u.is_active AS "isActive", u.blocked_at AS "blockedAt", u.blocked_reason AS "blockedReason",
              count(*) OVER()::int AS "totalCount"
         FROM users u WHERE ${where.join(' AND ')}
        ORDER BY u.last_seen DESC NULLS LAST, u.created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return {
      total: Number(rows[0]?.totalCount ?? 0),
      page: p,
      items: rows.map(({ totalCount: _total, ...row }) => ({ ...row, online: online.has(row.id), superAdmin: isSuperAdmin(row.id) })),
    };
  }

  async setUserBlocked(actorId: string, userId: string, blocked: boolean, reason?: string) {
    if (isSuperAdmin(userId)) throw new BadRequestException({ code: 'CANNOT_BLOCK_ADMIN', message: 'An Optima admin cannot be blocked' });
    const rows = await this.db.query<{ id: string }>(
      blocked
        ? `UPDATE users SET is_active = false, blocked_at = now(), blocked_reason = $2 WHERE id = $1 RETURNING id`
        : `UPDATE users SET is_active = true, blocked_at = NULL, blocked_reason = NULL WHERE id = $1 RETURNING id`,
      blocked ? [userId, reason?.slice(0, 500) || null] : [userId],
    );
    if (!rows[0]) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });
    // Auth caches the user row for half a minute; the block must bite now.
    await this.redis.drop(RedisKeys.cachedUser(userId));
    if (blocked) {
      // Signed out everywhere: sessions revoked, sockets cut by the gateway.
      await this.db.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);
      this.events.emit('admin.user_blocked', { userId });
    }
    await this.audit(actorId, blocked ? 'user.block' : 'user.unblock', 'user', userId, reason ? { reason } : {});
    return { userId, blocked };
  }

  async rooms(query = '', pageParam?: string, type?: string, filter?: string) {
    const p = page(pageParam);
    const where = [`r.type <> 'direct'`];
    const params: unknown[] = [];
    if (query.trim()) {
      params.push(`%${query.trim()}%`);
      where.push(`(r.name ILIKE $${params.length} OR r.slug ILIKE $${params.length})`);
    }
    if (type === 'group' || type === 'channel') { params.push(type); where.push(`r.type = $${params.length}`); }
    if (filter === 'blocked') where.push(`r.blocked_at IS NOT NULL`);
    params.push(50, (p - 1) * 50);
    const rows = await this.db.query<Record<string, unknown>>(
      `SELECT r.id, r.name, r.type, r.scope, r.slug, r.avatar_url AS "avatarUrl", r.created_at AS "createdAt",
              r.blocked_at AS "blockedAt", r.blocked_reason AS "blockedReason", r.last_message_at AS "lastMessageAt",
              (SELECT count(*)::int FROM chat_members m WHERE m.room_id = r.id AND m.left_at IS NULL AND m.status = 'active') AS "memberCount",
              (SELECT count(*)::int FROM chat_join_requests j WHERE j.room_id = r.id) AS "pendingRequests",
              u.first_name AS "ownerFirstName", u.last_name AS "ownerLastName", u.username AS "ownerUsername",
              count(*) OVER()::int AS "totalCount"
         FROM chat_rooms r LEFT JOIN users u ON u.id = r.created_by
        WHERE ${where.join(' AND ')}
        ORDER BY r.last_message_at DESC NULLS LAST, r.created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { total: Number(rows[0]?.totalCount ?? 0), page: p, items: rows.map(({ totalCount: _t, ...row }) => row) };
  }

  async setRoomBlocked(actorId: string, roomId: string, blocked: boolean, reason?: string) {
    const rows = await this.db.query<{ id: string; type: string }>(
      blocked
        ? `UPDATE chat_rooms SET blocked_at = now(), blocked_reason = $2 WHERE id = $1 AND type <> 'direct' RETURNING id, type`
        : `UPDATE chat_rooms SET blocked_at = NULL, blocked_reason = NULL WHERE id = $1 AND type <> 'direct' RETURNING id, type`,
      blocked ? [roomId, reason?.slice(0, 500) || null] : [roomId],
    );
    if (!rows[0]) throw new NotFoundException({ code: 'ROOM_NOT_FOUND', message: 'Group or channel not found' });
    await this.members.forgetRoomBlocked(roomId);
    this.events.emit('admin.room_blocked', { roomId, blocked });
    await this.audit(actorId, blocked ? 'room.block' : 'room.unblock', rows[0].type, roomId, reason ? { reason } : {});
    return { roomId, blocked };
  }

  /** The admin joins a group/channel — private ones too — as a visible member. */
  async joinRoom(actorId: string, roomId: string) {
    const [room] = await this.db.query<{ id: string; type: string }>(`SELECT id, type FROM chat_rooms WHERE id = $1`, [roomId]);
    if (!room || room.type === 'direct') throw new NotFoundException({ code: 'ROOM_NOT_FOUND', message: 'Group or channel not found' });
    await this.db.query(
      `INSERT INTO chat_members (room_id, user_id, status, role) VALUES ($1, $2, 'active', 'admin')
       ON CONFLICT (room_id, user_id) DO UPDATE SET left_at = NULL, status = 'active', role = 'admin', joined_at = now()`,
      [roomId, actorId],
    );
    await this.members.invalidateRoomMember(roomId, actorId);
    this.events.emit('chat.member_joined_by_admin', { roomId, userId: actorId });
    await this.audit(actorId, 'room.join', room.type, roomId);
    return { roomId, joined: true };
  }

  /** Everything waiting for an answer: ask-to-join requests (chats) and meeting lobbies. */
  async requests() {
    const [chat, meeting] = await Promise.all([
      this.db.query(
        `SELECT j.id, j.created_at AS "createdAt", r.id AS "roomId", r.name AS "roomName", r.type AS "roomType",
                u.id AS "userId", u.first_name AS "firstName", u.last_name AS "lastName", u.username
           FROM chat_join_requests j JOIN chat_rooms r ON r.id = j.room_id JOIN users u ON u.id = j.user_id
          ORDER BY j.created_at DESC LIMIT 200`,
      ),
      this.db.query(
        `SELECT q.id, q.requested_at AS "createdAt", m.id AS "meetingId", m.title AS "meetingTitle", m.meeting_code AS code,
                u.id AS "userId", u.first_name AS "firstName", u.last_name AS "lastName", u.username
           FROM meeting_join_requests q JOIN meetings m ON m.id = q.meeting_id JOIN users u ON u.id = q.user_id
          WHERE q.status = 'pending' ORDER BY q.requested_at DESC LIMIT 200`,
      ),
    ]);
    return { chat, meeting };
  }

  async liveMeetings() {
    return this.db.query(
      `SELECT m.id, m.title, m.meeting_code AS code, m.scope, m.start_time AS "startTime", m.chat_room_id AS "chatRoomId",
              h.first_name AS "hostFirstName", h.last_name AS "hostLastName",
              (SELECT count(*)::int FROM meeting_participants p WHERE p.meeting_id = m.id AND p.left_at IS NULL) AS participants
         FROM meetings m JOIN users h ON h.id = m.host_id
        WHERE m.status = 'live' ORDER BY participants DESC, m.start_time DESC LIMIT 100`,
    );
  }

  /** A person's signed-in devices (active sessions). */
  async userSessions(userId: string) {
    return this.db.query(
      `SELECT id, device_name AS "deviceName", device_info AS "deviceInfo", ip_address AS "ipAddress",
              user_agent AS "userAgent", device_id AS "deviceId", provider,
              created_at AS "createdAt", last_used_at AS "lastUsedAt"
         FROM refresh_tokens
        WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
        ORDER BY last_used_at DESC NULLS LAST`,
      [userId],
    );
  }

  /** Sign a person out everywhere (sessions revoked, sockets cut) without blocking them. */
  async revokeUserSessions(actorId: string, userId: string) {
    const rows = await this.db.query<{ id: string }>(
      `UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL RETURNING id`,
      [userId],
    );
    await this.redis.drop(RedisKeys.cachedUser(userId));
    this.events.emit('admin.user_blocked', { userId });
    await this.audit(actorId, 'user.sign_out_everywhere', 'user', userId, { sessions: String(rows.length) });
    return { userId, revoked: rows.length };
  }

  async auditLog(pageParam?: string) {
    const p = page(pageParam);
    return this.db.query(
      `SELECT a.id, a.action, a.target_type AS "targetType", a.target_id AS "targetId", a.details, a.created_at AS "createdAt",
              u.first_name AS "actorFirstName", u.last_name AS "actorLastName",
              COALESCE(tu.first_name || ' ' || tu.last_name, tr.name) AS "targetName"
         FROM admin_audit a
         LEFT JOIN users u ON u.id = a.actor_id
         LEFT JOIN users tu ON a.target_type = 'user' AND tu.id = a.target_id
         LEFT JOIN chat_rooms tr ON a.target_type <> 'user' AND tr.id = a.target_id
        ORDER BY a.created_at DESC LIMIT 50 OFFSET $1`,
      [(p - 1) * 50],
    );
  }
}
