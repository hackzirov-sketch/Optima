import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { ChatMemberService } from './member.service';

type SharedKind = 'media' | 'files' | 'links' | 'music' | 'voice';

/**
 * Ported from UPZ-main onto the raw-SQL DatabaseService used by the
 * production branch (was @InjectDataSource() DataSource from TypeORM --
 * DatabaseService.query() has the identical signature/return shape, so
 * only the injected type changed, not the SQL). Relies on the
 * chat_rooms.slug / is_system / membership_locked / posting_mode /
 * linked_room_id columns and the chat_members.role column added by the
 * OTIMA community schema patch appended to init.sql -- see MERGE_NOTES.md.
 */
@Injectable()
export class CommunityService {
  constructor(
    private readonly dataSource: DatabaseService,
    private readonly members: ChatMemberService,
  ) {}

  async overview(userId: string) {
    const rows = await this.dataSource.query(
      `SELECT r.id, r.slug, r.name, r.description, r.avatar_url AS "avatarUrl",
              CASE WHEN r.slug = 'otima-community' THEN 'channel' ELSE r.type::text END AS type,
              r.linked_room_id AS "linkedRoomId", r.created_at AS "createdAt",
              cm.role AS "myRole", cm.is_muted AS "isMuted",
              (SELECT count(*)::int FROM chat_members m WHERE m.room_id = r.id AND m.status = 'active' AND m.left_at IS NULL) AS "memberCount",
              (SELECT count(*)::int FROM chat_messages x WHERE x.room_id = r.id AND x.deleted_at IS NULL) AS "messageCount"
       FROM chat_rooms r
       JOIN chat_members cm ON cm.room_id = r.id AND cm.user_id = $1 AND cm.status = 'active' AND cm.left_at IS NULL
       WHERE r.slug IN ('otima-community', 'otima-community-group')
       ORDER BY CASE r.slug WHEN 'otima-community' THEN 0 ELSE 1 END`,
      [userId],
    );
    return { channel: rows[0] ?? null, group: rows[1] ?? null };
  }

  async listMembers(roomId: string, userId: string, query = '', page = 1, limit = 30) {
    await this.members.assertRoomMember(roomId, userId);
    const safeLimit = Math.min(Math.max(limit || 30, 1), 100);
    const safePage = Math.max(page || 1, 1);
    const params: unknown[] = [roomId, safeLimit, (safePage - 1) * safeLimit];
    const search = query.trim();
    let searchSql = '';
    if (search) {
      params.push(`%${search}%`);
      searchSql = `AND (u.first_name ILIKE $4 OR u.last_name ILIKE $4 OR u.username ILIKE $4)`;
    }
    const items = await this.dataSource.query(
      `SELECT u.public_id AS "publicId", u.first_name AS "firstName", u.last_name AS "lastName", u.username,
              u.avatar_url AS "avatarUrl", u.last_seen AS "lastSeen", cm.role, cm.joined_at AS "joinedAt"
       FROM chat_members cm JOIN users u ON u.id = cm.user_id
       WHERE cm.room_id = $1 AND cm.status = 'active' AND cm.left_at IS NULL
         AND u.deleted_at IS NULL ${searchSql}
       ORDER BY CASE cm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, u.first_name, u.last_name
       LIMIT $2 OFFSET $3`,
      params,
    );
    const countRows = await this.dataSource.query(
      `SELECT count(*)::int AS total FROM chat_members cm JOIN users u ON u.id = cm.user_id
       WHERE cm.room_id = $1 AND cm.status = 'active' AND cm.left_at IS NULL
         AND u.deleted_at IS NULL ${searchSql}`,
      search ? [roomId, safeLimit, 0, `%${search}%`] : [roomId],
    );
    return { items, page: safePage, limit: safeLimit, total: countRows[0]?.total ?? 0 };
  }

  async shared(roomId: string, userId: string, kind: SharedKind, cursor?: string, limit = 30) {
    await this.members.assertRoomMember(roomId, userId);
    if (!['media', 'files', 'links', 'music', 'voice'].includes(kind)) {
      throw new BadRequestException('Unsupported shared content type');
    }
    const mimeFilter: Record<Exclude<SharedKind, 'links'>, string> = {
      media: `(a.mime_type LIKE 'image/%' OR a.mime_type LIKE 'video/%')`,
      files: `(a.mime_type NOT LIKE 'image/%' AND a.mime_type NOT LIKE 'video/%' AND a.mime_type NOT LIKE 'audio/%')`,
      music: `(a.mime_type LIKE 'audio/%' AND m.content_type <> 'voice')`,
      voice: `(a.mime_type LIKE 'audio/%' AND m.content_type = 'voice')`,
    };
    const safeLimit = Math.min(Math.max(limit || 30, 1), 100);
    if (kind === 'links') {
      return this.dataSource.query(
        `SELECT m.id AS "messageId", m.content, m.created_at AS "createdAt", u.username,
                regexp_matches(m.content, '(https?://[^[:space:]]+)', 'g') AS url
         FROM chat_messages m JOIN users u ON u.id = m.sender_id
         WHERE m.room_id = $1 AND m.deleted_at IS NULL AND m.content ~ 'https?://'
           AND ($2::timestamptz IS NULL OR m.created_at < $2) ORDER BY m.created_at DESC LIMIT $3`,
        [roomId, cursor ?? null, safeLimit],
      );
    }
    return this.dataSource.query(
      `SELECT a.id, a.message_id AS "messageId", a.file_name AS "fileName", a.file_size AS "fileSize",
              a.mime_type AS "mimeType", a.storage_url AS "storageUrl", a.width, a.height,
              a.created_at AS "createdAt", u.username
       FROM message_attachments a
       JOIN chat_messages m ON m.id = a.message_id JOIN users u ON u.id = a.uploader_id
       WHERE m.room_id = $1 AND m.deleted_at IS NULL AND ${mimeFilter[kind as Exclude<SharedKind, 'links'>]}
         AND ($2::timestamptz IS NULL OR a.created_at < $2)
       ORDER BY a.created_at DESC LIMIT $3`,
      [roomId, cursor ?? null, safeLimit],
    );
  }

  async getOrCreateDiscussion(messageId: string, userId: string) {
    const sourceRows = await this.dataSource.query(
      `SELECT m.id, m.content, m.sender_id AS "senderId", r.linked_room_id AS "groupId", r.slug
       FROM chat_messages m JOIN chat_rooms r ON r.id = m.room_id
       WHERE m.id = $1 AND m.deleted_at IS NULL`,
      [messageId],
    );
    const source = sourceRows[0];
    if (!source || source.slug !== 'otima-community' || !source.groupId) {
      throw new NotFoundException('Community channel post not found');
    }
    await this.members.assertRoomMember(source.groupId, userId);
    return this.dataSource.withTransaction(async (query) => {
      const existing = await query(
        `SELECT id, room_id AS "roomId", source_channel_message_id AS "sourceChannelMessageId"
         FROM chat_messages WHERE source_channel_message_id = $1 AND deleted_at IS NULL LIMIT 1`,
        [messageId],
      );
      if (existing[0]) return existing[0];
      const sequenceRows = await query(
        `UPDATE chat_rooms SET message_seq = message_seq + 1 WHERE id = $1 RETURNING message_seq`,
        [source.groupId],
      );
      const inserted = await query(
        `INSERT INTO chat_messages
           (room_id, sender_id, sequence, content, content_type, is_system, system_metadata, source_channel_message_id)
         VALUES ($1, $2, $3, $4, 'text', true, $5::jsonb, $6)
         ON CONFLICT (source_channel_message_id) WHERE source_channel_message_id IS NOT NULL AND deleted_at IS NULL
         DO UPDATE SET source_channel_message_id = EXCLUDED.source_channel_message_id
         RETURNING id, room_id AS "roomId", source_channel_message_id AS "sourceChannelMessageId"`,
        [source.groupId, source.senderId, sequenceRows[0].message_seq, source.content ?? '', JSON.stringify({ kind: 'channel_discussion' }), messageId],
      );
      await query(
        `UPDATE chat_messages SET discussion_root_message_id = $2 WHERE id = $1`,
        [messageId, inserted[0].id],
      );
      return inserted[0];
    });
  }

  async updateMemberRole(roomId: string, targetUsername: string, role: 'member' | 'admin', userId: string) {
    const requester = await this.members.assertRoomMember(roomId, userId);
    if (!['admin', 'owner'].includes(requester.role)) throw new ForbiddenException('Admin permission required');
    const roomRows = await this.dataSource.query(`SELECT is_system AS "isSystem" FROM chat_rooms WHERE id = $1`, [roomId]);
    if (!roomRows[0]?.isSystem) throw new BadRequestException('This endpoint is for system resources');
    const result = await this.dataSource.query(
      `UPDATE chat_members cm SET role = $3 FROM users u
       WHERE cm.room_id = $1 AND cm.user_id = u.id AND u.username = $2
       RETURNING cm.user_id AS "userId", cm.role`,
      [roomId, targetUsername, role],
    );
    if (!result[0]) throw new NotFoundException('Member not found');
    return result[0];
  }
}
