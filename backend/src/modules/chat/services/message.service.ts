import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { InjectQueue } from '@nestjs/bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Queue } from 'bullmq';

import { ChatMessage } from '../../../database/entities/chat-message.entity';
import { MessageDraft } from '../../../database/entities/message-draft.entity';
import { ChatReaction } from '../../../database/entities/chat-reaction.entity';
import { MessageAttachment } from '../../../database/entities/message-attachment.entity';
import { ErrorCode } from '../../../common/enums/error-code.enum';
import { ChatEncryptionService } from '../chat-encryption.service';
import { ChatMemberService } from './member.service';
import { ChatReactionService } from './reaction.service';
import {
  ChannelSettings,
  ChannelSettingsService,
  RoomRole,
  roleSatisfies,
} from './channel-settings.service';
import { ContentFilterService } from '../../moderation/services/content-filter.service';
import { StorageService } from '../../storage/storage.service';
import { RedisService } from '../../../redis/redis.service';
import { SendMessageDto } from '../dto/send-message.dto';
import { UpdateMessageDto } from '../dto/update-message.dto';
import { v4 as uuidv4 } from 'uuid';
import {
  CHAT_MESSAGE_COLUMNS_SQL,
  CHAT_REACTION_COLUMNS_SQL,
  MESSAGE_ATTACHMENT_COLUMNS_SQL,
} from '../chat.sql';
import { extractMentions } from '../mention.util';
import { ChatE2eeService } from '../e2ee/e2ee.service';
import { E2eeEnvelope } from '../e2ee/e2ee.util';

/**
 * Telegram's album size. The cap exists on the server as well as the composer
 * because the composer is only a suggestion: the send endpoint is reachable
 * directly, and an unbounded attachment array is an unbounded INSERT.
 */
export const MAX_ATTACHMENTS_PER_MESSAGE = 10;

/**
 * A `chat_messages` row as this service selects it — camelCase aliases, plus
 * the optional joined sender. Not the entity: the queries here pick a subset
 * and add derived columns, so claiming `ChatMessage` would overstate what's
 * actually present.
 */
export interface ChatMessageRow {
  id: string;
  roomId: string;
  senderId: string | null;
  sequence: number;
  clientMessageId?: string | null;
  content?: string | null;
  contentJson?: unknown;
  contentType?: string | null;
  metadata?: unknown;
  replyToId?: string | null;
  isThreadReply?: boolean | null;
  isEdited?: boolean | null;
  editedAt?: Date | string | null;
  isSystem?: boolean | null;
  systemMetadata?: unknown;
  createdAt: Date | string;
  updatedAt?: Date | string;
  threadReplyCount?: number | null;
  threadRootId?: string | null;
  sender?: MessageSender | null;
  deletedAt?: Date | string | null;
  isE2ee?: boolean | null;
}

export interface MessageSender {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
}

/** What every send/list path hands back to controllers and the gateway. */
export interface ChatMessageResponse {
  id: string;
  roomId: string;
  senderId: string | null;
  sequence: number;
  clientMessageId?: string | null;
  metadata?: unknown;
  /** Plaintext — null for end-to-end encrypted messages, see `e2ee`. */
  content: string | null;
  /** Ciphertext for E2EE rooms; only member devices can open it. */
  e2ee: E2eeEnvelope | null;
  contentType: string;
  attachments: MappedAttachment[];
  replyToId: string | null;
  isThreadReply: boolean;
  isEdited: boolean;
  editedAt: Date | string | null;
  createdAt: Date | string;
  isSystem: boolean;
  systemMetadata: unknown;
  reactions: unknown[];
  sender: MessageSender | null;
  /** Set only on thread-reply responses. */
  threadReplyCount?: number | null;
  threadRootId?: string | null;
}

export interface MappedAttachment {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  url: string;
  width: number | null;
  height: number | null;
}

@Injectable()
export class ChatMessageService {
  constructor(
    private readonly dataSource: DatabaseService,
    private readonly chatMemberService: ChatMemberService,
    private readonly chatReactionService: ChatReactionService,
    private readonly contentFilter: ContentFilterService,
    private readonly chatEncryption: ChatEncryptionService,
    private readonly storageService: StorageService,
    private readonly redisService: RedisService,
    private readonly channelSettings: ChannelSettingsService,
    private readonly events: EventEmitter2,
    private readonly e2ee: ChatE2eeService,
    @InjectQueue('chat') private readonly chatQueue: Queue,
  ) {}

  /**
   * The readable body of a stored message. E2EE rows are handed back as the
   * ciphertext envelope untouched — the server has no key for them; public
   * rows are decrypted from the at-rest encryption.
   */
  private bodyOf(row: {
    isE2ee?: boolean | null;
    contentType?: string | null;
    content?: string | null;
    contentJson?: unknown;
  }): { content: string | null; e2ee: E2eeEnvelope | null } {
    if (row.isE2ee)
      return { content: null, e2ee: (row.contentJson as E2eeEnvelope) ?? null };
    if (row.contentType === 'document')
      return { content: row.content ?? null, e2ee: null };
    return {
      content: this.chatEncryption.safeDecrypt(
        row.contentJson as any,
        row.content ?? '',
      ),
      e2ee: null,
    };
  }

  /**
   * Media/voice/file permissions. Each attachment is classified by its MIME
   * type and checked against the audience the room allows for that kind, so a
   * channel can accept text and pictures while refusing voice notes.
   */
  private assertMediaAllowed(
    dto: SendMessageDto,
    settings: ChannelSettings,
    role: RoomRole,
  ) {
    const attachments = dto.attachments ?? [];
    if (attachments.length === 0) return;

    if (attachments.length > MAX_ATTACHMENTS_PER_MESSAGE)
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: `A message can carry at most ${MAX_ATTACHMENTS_PER_MESSAGE} attachments`,
      });

    for (const attachment of attachments) {
      const mime = attachment.mimeType ?? '';
      const isVoice =
        mime.startsWith('audio/') || attachment.fileName?.startsWith('voice-');
      const isMedia =
        mime.startsWith('image/') || mime.startsWith('video/') || isVoice;

      const audience = isVoice
        ? settings.whoCanSendVoice
        : isMedia
          ? settings.whoCanSendMedia
          : settings.whoCanUploadFiles;

      if (!roleSatisfies(role, audience))
        throw new ForbiddenException({
          code: ErrorCode.INSUFFICIENT_PERMISSIONS,
          message: isVoice
            ? 'Voice messages are not allowed in this room'
            : isMedia
              ? 'Media is not allowed in this room'
              : 'File uploads are not allowed in this room',
        });

      if (
        settings.maxUploadBytes &&
        Number(attachment.fileSize) > settings.maxUploadBytes
      )
        throw new BadRequestException({
          code: ErrorCode.STORAGE_FILE_TOO_LARGE,
          message: `This room limits uploads to ${Math.floor(settings.maxUploadBytes / (1024 * 1024))} MB`,
        });

      if (
        settings.allowedFileTypes.length > 0 &&
        !settings.allowedFileTypes.some((allowed) =>
          allowed.endsWith('/*')
            ? mime.startsWith(allowed.slice(0, -1))
            : allowed === mime,
        )
      )
        throw new BadRequestException({
          code: ErrorCode.STORAGE_INVALID_MIME,
          message: `This room only accepts: ${settings.allowedFileTypes.join(', ')}`,
        });
    }
  }

  /**
   * Slow mode. Enforced in Redis with `SET NX EX` — the key's own expiry is
   * the timer, so there is no timestamp arithmetic and no row to clean up.
   * Moderators and above are exempt, as they are the ones moderating.
   *
   * Fails open when Redis is down, matching the rest of the chat pipeline:
   * losing Redis should slow nobody down, and slow mode is a courtesy limit
   * rather than a security boundary.
   */
  private async assertSlowMode(
    roomId: string,
    userId: string,
    seconds: number,
    role: RoomRole,
  ) {
    if (seconds <= 0 || roleSatisfies(role, 'moderators')) return;
    const client = this.redisService.getClient();
    if (!client) return;

    const key = `slowmode:${roomId}:${userId}`;
    const acquired = await client.set(key, '1', 'EX', seconds, 'NX');
    if (acquired) return;

    const remaining = await client.ttl(key);
    throw new ForbiddenException({
      code: 'CHAT_SLOW_MODE',
      message: `Slow mode is on — wait ${remaining > 0 ? remaining : seconds}s before posting again`,
    });
  }

  /** Link and bad-word filters, both opt-in per room. */
  private assertContentAllowed(content: string, settings: ChannelSettings) {
    if (!content) return;

    if (settings.linkFilter && /\bhttps?:\/\/|\bwww\./i.test(content))
      throw new ForbiddenException({
        code: 'CHAT_LINKS_BLOCKED',
        message: 'Links are not allowed in this room',
      });

    if (settings.badWordsFilter && settings.badWords.length > 0) {
      const haystack = content.toLowerCase();
      const hit = settings.badWords.find((word) =>
        haystack.includes(word.toLowerCase()),
      );
      if (hit)
        throw new ForbiddenException({
          code: 'CHAT_CONTENT_BLOCKED',
          message: 'Your message contains words blocked in this room',
        });
    }
  }

  /**
   * A non-user-authored chat entry (currently: call outcomes — missed/
   * declined/ended with duration). Rendered by the frontend as a centered
   * system row, not a normal bubble, per `isSystem`/`systemMetadata`.
   */
  async createSystemMessage(
    roomId: string,
    senderId: string,
    content: string,
    contentType: string,
    systemMetadata: Record<string, unknown>,
  ) {
    // Defence in depth: callers pass a roomId that ultimately originates from a
    // client payload (call signaling), so re-check the attributed sender really
    // belongs to the room rather than trusting the caller to have done it.
    const memberRows = await this.dataSource.query(
      `SELECT id FROM chat_members
       WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL AND status = 'active'`,
      [roomId, senderId],
    );
    if (!memberRows[0]) {
      throw new ForbiddenException({
        code: ErrorCode.NOT_ROOM_MEMBER,
        message: 'Not a member of this chat room',
      });
    }

    const redisClient = this.redisService.getClient();
    let sequence = 1;
    if (redisClient) {
      sequence = await redisClient.incr(`room:${roomId}:seq`);
    } else {
      const maxRes = await this.dataSource.query<{ max: number | null }>(
        `SELECT MAX(sequence) AS max FROM chat_messages WHERE room_id = $1`,
        [roomId],
      );
      sequence = (maxRes[0]?.max || 0) + 1;
    }

    const savedRows = await this.dataSource.query<ChatMessage>(
      `INSERT INTO chat_messages
         (room_id, sender_id, sequence, content, content_type, is_system, system_metadata, metadata)
       VALUES ($1, $2, $3, $4, $5, true, $6, $7)
       RETURNING ${CHAT_MESSAGE_COLUMNS_SQL}`,
      [roomId, senderId, sequence, content, contentType, systemMetadata, {}],
    );
    const saved = savedRows[0];

    await this.chatQueue.add(
      'update-room-metadata',
      {
        roomId,
        sequence,
        lastMessageId: saved.id,
        lastMessageAt: saved.createdAt,
      },
      { jobId: roomId, removeOnComplete: true, removeOnFail: true },
    );

    return this.mapToResponse(saved, content, []);
  }

  async listMessages(
    roomId: string,
    userId: string,
    page = 1,
    limit = 50,
    cursor?: number,
  ) {
    await this.chatMemberService.assertRoomMember(roomId, userId);

    const l = Number(limit) || 50;
    const p = Number(page) || 1;

    const params: unknown[] = [roomId];
    // Thread replies are excluded from the main timeline (Slack-style) — they only
    // surface via getThread(). The inline reply_to_id quote-reply feature (unrelated
    // to threads) still shows normally since it doesn't set is_thread_reply.
    let whereClause = `m.room_id = $1 AND m.deleted_at IS NULL AND m.is_thread_reply = false`;
    if (cursor) {
      params.push(cursor);
      whereClause += ` AND m.sequence < $${params.length}`;
    }
    params.push(l);
    const limitParam = `$${params.length}`;
    let offsetClause = '';
    if (!cursor) {
      params.push((p - 1) * l);
      offsetClause = `OFFSET $${params.length}`;
    }

    const messages = await this.dataSource.query<any>(
      `SELECT
         m.id AS "id", m.room_id AS "roomId", m.sender_id AS "senderId",
         m.reply_to_id AS "replyToId", m.content, m.content_json AS "contentJson",
         m.content_type AS "contentType", m.is_edited AS "isEdited", m.edited_at AS "editedAt",
         m.is_system AS "isSystem", m.system_metadata AS "systemMetadata", m.created_at AS "createdAt", m.updated_at AS "updatedAt",
         m.sequence, m.client_message_id AS "clientMessageId", m.metadata, m.is_e2ee AS "isE2ee",
         u.id AS "s_id", u.first_name AS "s_firstName", u.last_name AS "s_lastName",
         u.avatar_url AS "s_avatarUrl", u.name_emoji AS "s_nameEmoji", u.nickname AS "s_nickname",
         t.reply_count AS "threadReplyCount", t.last_reply_at AS "threadLastReplyAt"
       FROM chat_messages m
       LEFT JOIN users u ON u.id = m.sender_id
       LEFT JOIN message_threads t ON t.root_message_id = m.id
       WHERE ${whereClause}
       ORDER BY m.sequence DESC
       LIMIT ${limitParam} ${offsetClause}`,
      params,
    );

    let total: number | undefined;
    if (!cursor) {
      const countRows = await this.dataSource.query<{ count: string }>(
        `SELECT COUNT(*) FROM chat_messages m WHERE m.room_id = $1 AND m.deleted_at IS NULL AND m.is_thread_reply = false`,
        [roomId],
      );
      total = Number(countRows[0]?.count ?? 0);
    }

    if (messages.length === 0) {
      return { data: [], total, page: cursor ? undefined : page, limit: l };
    }

    const msgIds = messages.map((m) => m.id);

    const reactions = await this.dataSource.query<ChatReaction>(
      `SELECT ${CHAT_REACTION_COLUMNS_SQL} FROM chat_reactions WHERE message_id = ANY($1::uuid[])`,
      [msgIds],
    );
    const reactionsByMsg = new Map<string, ChatReaction[]>();
    for (const r of reactions) {
      if (!reactionsByMsg.has(r.messageId)) reactionsByMsg.set(r.messageId, []);
      reactionsByMsg.get(r.messageId)!.push(r);
    }

    const attachments = await this.dataSource.query<MessageAttachment>(
      `SELECT ${MESSAGE_ATTACHMENT_COLUMNS_SQL} FROM message_attachments WHERE message_id = ANY($1::uuid[])`,
      [msgIds],
    );
    const attachmentsByMsg = new Map<string, MessageAttachment[]>();
    for (const a of attachments) {
      if (!attachmentsByMsg.has(a.messageId))
        attachmentsByMsg.set(a.messageId, []);
      attachmentsByMsg.get(a.messageId)!.push(a);
    }

    const data = messages.map((msg) => ({
      id: msg.id,
      roomId: msg.roomId,
      senderId: msg.senderId,
      sequence: msg.sequence,
      clientMessageId: msg.clientMessageId,
      metadata: msg.metadata,
      sender: msg.s_id
        ? {
            id: msg.s_id,
            firstName: msg.s_firstName,
            lastName: msg.s_lastName,
            avatarUrl: msg.s_avatarUrl,
            nameEmoji: msg.s_nameEmoji,
            nickname: msg.s_nickname,
          }
        : null,
      ...this.bodyOf(msg),
      contentType: msg.contentType,
      attachments: (attachmentsByMsg.get(msg.id) ?? []).map((a) =>
        this.mapAttachment(a),
      ),
      replyToId: msg.replyToId ?? null,
      isEdited: msg.isEdited,
      editedAt: msg.isEdited ? (msg.editedAt ?? msg.updatedAt) : null,
      isSystem: msg.isSystem,
      systemMetadata: msg.systemMetadata,
      createdAt: msg.createdAt,
      updatedAt: msg.updatedAt,
      reactions: this.chatReactionService.groupReactions(
        reactionsByMsg.get(msg.id) ?? [],
      ),
      threadReplyCount: msg.threadReplyCount ? Number(msg.threadReplyCount) : 0,
      threadLastReplyAt: msg.threadLastReplyAt ?? null,
    }));

    return { data, total, limit: l };
  }

  /**
   * Flood protection: too many messages in a short window ("kop xabar bo'lib ketish").
   * Content-filter only catches spammy *content* (repeated chars, caps, etc) — this
   * catches spammy *frequency* (e.g. 20 short messages in 5 seconds), which the
   * existing heuristics never see because each individual message looks fine.
   *
   * Sliding window via Redis INCR + EX. Falls back to allow-through if Redis is down
   * (same fail-open posture as the rest of the chat pipeline when Redis is unavailable).
   */
  /**
   * 10 messages/second per user is the target ceiling — generous for any
   * real client (typing + send simply can't sustain that), but tight enough
   * to make scripted flooding pointless. Global per-user (not per-room), so
   * spreading messages across multiple rooms doesn't bypass it.
   *
   * Two windows:
   *  - 1s burst window: hard cap at 10 — absorbs legitimate short bursts
   *    (e.g. pasting several lines that get sent as separate messages).
   *  - 60s sustained window: cap at 120 (avg 2/s) — a client hammering
   *    exactly 10/s nonstop for a minute straight is not a human, this
   *    catches that pattern even though each individual second passes.
   */
  async sendMessage(roomId: string, userId: string, dto: SendMessageDto) {
    const roomRows = await this.dataSource.query<{
      id: string;
      type: string;
      scope: string;
      e2eeEpoch: number;
      isReadOnly: boolean;
      postingMode: string | null;
    }>(
      `SELECT id, type, scope, e2ee_epoch AS "e2eeEpoch",
              is_read_only AS "isReadOnly", posting_mode AS "postingMode"
         FROM chat_rooms WHERE id = $1`,
      [roomId],
    );
    const room = roomRows[0];
    if (!room)
      throw new NotFoundException({
        code: ErrorCode.ROOM_NOT_FOUND,
        message: 'Room not found',
      });
    // assertRoomMemberWithUser: membership + user bir SELECT'da — keyinroq sender uchun alohida query yo'q
    const member = await this.chatMemberService.assertRoomMemberWithUser(
      roomId,
      userId,
    );
    if (room.isReadOnly)
      throw new ForbiddenException({
        code: ErrorCode.ROOM_READ_ONLY,
        message: 'Room is read-only',
      });
    if (
      member.isBanned ||
      (member.bannedUntil && new Date(member.bannedUntil) > new Date())
    ) {
      throw new ForbiddenException({
        code: 'CHAT_MEMBER_BANNED',
        message: 'You cannot send messages in this room',
      });
    }
    // Posting rights come from channel_settings, keyed on the caller's role in
    // this room. This replaced a hardcoded public_id of '777777' — a magic
    // account that locked every real channel owner out of their own channel,
    // couldn't be granted or revoked without a deploy, and silently handed the
    // rights to whoever landed on that sequence value.
    const settings = await this.channelSettings.getRaw(roomId);
    const role = (member.role as RoomRole) ?? 'member';
    if (!roleSatisfies(role, settings.whoCanPost)) {
      throw new ForbiddenException({
        code: 'CHANNEL_ADMIN_ONLY',
        message: 'Only channel admins can publish posts',
      });
    }

    this.assertMediaAllowed(dto, settings, role);
    // The room's own upload policy (above) only reads what the client *said*
    // the file is. This is what ties the claim to a real upload of ours — see
    // StorageService.assertOwnedAttachment. Both sendMessage and
    // sendThreadReply come through here, so one check covers both.
    for (const attachment of dto.attachments ?? []) {
      this.storageService.assertOwnedAttachment(
        attachment.storageUrl,
        attachment.storageKey,
        userId,
      );
    }
    await this.assertSlowMode(roomId, userId, settings.slowModeSeconds, role);
    this.assertContentAllowed(dto.content ?? '', settings);

    if (dto.isThreadReply) {
      if (!dto.replyToId) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message:
            'replyToId (thread root message id) is required for a thread reply',
        });
      }
      const rootRows = await this.dataSource.query<{
        id: string;
        roomId: string;
        isThreadReply: boolean;
      }>(
        `SELECT id, room_id AS "roomId", is_thread_reply AS "isThreadReply"
           FROM chat_messages WHERE id = $1 AND deleted_at IS NULL`,
        [dto.replyToId],
      );
      const rootMsg = rootRows[0];
      if (!rootMsg || rootMsg.roomId !== roomId)
        throw new NotFoundException({
          code: ErrorCode.MESSAGE_NOT_FOUND,
          message: 'Thread root message not found in this room',
        });
      if (rootMsg.isThreadReply)
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message:
            'Cannot start a thread on a reply — thread on the root message instead',
        });
    }

    const hasAttachments = !!dto.attachments?.length;
    // DMs and private rooms take ciphertext only, public rooms plaintext only.
    const envelope = await this.e2ee.assertMessageEncryption(
      room,
      userId,
      dto.e2ee,
      !!dto.content?.trim(),
    );
    if (!dto.content?.trim() && !hasAttachments && !envelope) {
      throw new BadRequestException({
        code: ErrorCode.MESSAGE_EMPTY,
        message: 'Message content is required',
      });
    }

    if (dto.content?.trim()) {
      await this.contentFilter.filterText(dto.content, userId, 'chat');
    }

    // 1. Idempotency Check
    if (dto.clientMessageId) {
      const existingRows = await this.dataSource.query<any>(
        `SELECT ${CHAT_MESSAGE_COLUMNS_SQL} FROM chat_messages
         WHERE room_id = $1 AND sender_id = $2 AND client_message_id = $3`,
        [roomId, userId, dto.clientMessageId],
      );
      if (existingRows[0]) {
        const existing = existingRows[0];
        const existingAttachments =
          await this.dataSource.query<MessageAttachment>(
            `SELECT ${MESSAGE_ATTACHMENT_COLUMNS_SQL} FROM message_attachments WHERE message_id = $1`,
            [existing.id],
          );
        // Decrypt, don't read `content` raw. With encryption on, the column is
        // empty and the body lives in content_json — so a retried send (the
        // exact case this idempotency check exists for) echoed a blank message
        // back to the client that sent it.
        return this.mapToResponse(
          existing,
          this.bodyOf(existing).content ?? '',
          existingAttachments,
        );
      }
    }

    // 2. Redis Sequence (Atomic)
    const redisClient = this.redisService.getClient();
    let sequence = 1;
    if (redisClient) {
      sequence = await redisClient.incr(`room:${roomId}:seq`);
    } else {
      // Fallback if Redis is down
      const maxRes = await this.dataSource.query<{ max: number | null }>(
        `SELECT MAX(sequence) AS max FROM chat_messages WHERE room_id = $1`,
        [roomId],
      );
      sequence = (maxRes[0]?.max || 0) + 1;
    }

    const plainText = (dto.content ?? '').trim();
    let contentToSave = plainText;
    let contentType = hasAttachments ? 'media' : 'text';
    let contentJson: any = null;
    const isE2ee = !!envelope;

    // 3. Length check (4096) — only applies to plain text messages, not media captions
    if (envelope) {
      // Stored exactly as the sender's device produced it.
      contentJson = envelope;
      contentToSave = '';
    } else if (!hasAttachments && plainText.length > 4096) {
      contentType = 'document';
      const key = `chat-long-messages/${uuidv4()}.txt`;
      const buffer = Buffer.from(plainText, 'utf-8');
      const { url } = await this.storageService.uploadBuffer(
        buffer,
        key,
        'text/plain',
      );

      contentToSave = plainText.substring(0, 150) + '...'; // Preview
      contentJson = { documentUrl: url, key }; // Store URL in JSON
    } else if (plainText) {
      contentJson = this.chatEncryption.isEnabled()
        ? this.chatEncryption.encrypt(plainText)
        : null;
      if (contentJson) contentToSave = '';
    }

    // The message, the sender's read marker, the thread counter and the
    // attachment rows are one unit of work. Previously they were four separate
    // statements, so a failure partway through could persist a message whose
    // attachments never arrived — visible to every other member as an empty
    // bubble that no retry would ever fill in.
    let savedAttachments: MessageAttachment[] = [];
    const saved: any = await this.dataSource.withTransaction(async (query) => {
      const savedRows = await query<ChatMessage>(
        `INSERT INTO chat_messages
           (room_id, sender_id, sequence, client_message_id, content, content_json,
            content_type, reply_to_id, metadata, is_thread_reply, is_e2ee)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING ${CHAT_MESSAGE_COLUMNS_SQL}`,
        [
          roomId,
          userId,
          sequence,
          dto.clientMessageId ?? null,
          contentToSave,
          contentJson,
          contentType,
          dto.replyToId ?? null,
          {},
          !!dto.isThreadReply,
          isE2ee,
        ],
      );
      const message: any = savedRows[0];

      // The sender has implicitly "read" up to their own message - keeps their
      // own unread badge for this room from lagging behind what they just sent.
      await query(
        `UPDATE chat_members SET last_read_seq = GREATEST(last_read_seq, $3), last_read_message_id = $4, last_read_at = now()
         WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL`,
        [roomId, userId, sequence, message.id],
      );

      if (dto.isThreadReply && dto.replyToId) {
        const threadRows = await query<{ replyCount: number }>(
          `INSERT INTO message_threads (room_id, root_message_id, reply_count, last_reply_at)
           VALUES ($1, $2, 1, now())
           ON CONFLICT (root_message_id) DO UPDATE SET
             reply_count = message_threads.reply_count + 1, last_reply_at = now()
           RETURNING reply_count AS "replyCount"`,
          [roomId, dto.replyToId],
        );
        message.threadReplyCount = threadRows[0].replyCount;
        message.threadRootId = dto.replyToId;
      }

      // Attachments were already uploaded to storage via
      // /chat/rooms/:roomId/attachments/presign — this only records them.
      if (hasAttachments) {
        const values: string[] = [];
        const params: unknown[] = [];
        dto.attachments!.forEach((a, i) => {
          const base = i * 9;
          values.push(
            `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9})`,
          );
          params.push(
            message.id,
            userId,
            a.fileName,
            a.fileSize,
            a.mimeType,
            a.storageKey,
            a.storageUrl,
            a.width ?? null,
            a.height ?? null,
          );
        });
        savedAttachments = await query(
          `INSERT INTO message_attachments
             (message_id, uploader_id, file_name, file_size, mime_type, storage_key, storage_url, width, height)
           VALUES ${values.join(', ')}
           RETURNING ${MESSAGE_ATTACHMENT_COLUMNS_SQL}`,
          params,
        );
      }

      return message;
    });

    // 4. Background Jobs — parallel, not sequential
    // Thread replies are hidden from the main timeline (Slack-style), so they must
    // NOT bump the room's "last message" preview in the sidebar — only the
    // notification/side-effects job runs for them.
    const jobs = [
      this.chatQueue.add(
        'message-side-effects',
        {
          messageId: saved.id,
          roomId,
          senderId: userId,
          // Lets the worker place the recipient's read cursor when it reopens
          // a DM they had deleted — see reopenDirectRoomForRecipients.
          sequence,
          // Parsed here, where the plaintext already is. Message bodies are
          // encrypted at rest, so doing it in the worker would mean decrypting
          // again; passing the extracted handles instead keeps the ciphertext
          // the only copy of the message and puts nothing but public usernames
          // on the queue. They are unverified strings at this point — the
          // worker decides which correspond to real members of this room.
          mentions: extractMentions(dto.content),
        },
        { jobId: saved.id },
      ),
    ];
    if (!dto.isThreadReply) {
      jobs.push(
        this.chatQueue.add(
          'update-room-metadata',
          {
            roomId,
            sequence,
            lastMessageId: saved.id,
            lastMessageAt: saved.createdAt,
          },
          // jobId dedupes bursts of messages in the same room into one job, but
          // BullMQ treats a jobId as permanently taken once that job exists -
          // without removeOnComplete/removeOnFail, only the very first message
          // ever sent in a room would actually update message_seq, since every
          // later add() with the same jobId silently no-ops against the
          // already-completed job instead of enqueuing a new one.
          { jobId: roomId, removeOnComplete: true, removeOnFail: true },
        ),
      );
    }
    await Promise.all(jobs);

    // Fix: sender'ni DB'dan qayta yuklamaymiz — assertRoomMemberWithUser yuqorida
    // user join bilan chaqirilgan, shuning uchun alohida SELECT yo'q.
    const senderUser = member.user ?? null;

    return this.mapToResponseWithSender(
      saved,
      plainText,
      senderUser,
      savedAttachments,
    );
  }

  async deleteMessage(messageId: string, userId: string) {
    const rows = await this.dataSource.query<ChatMessage>(
      `SELECT ${CHAT_MESSAGE_COLUMNS_SQL} FROM chat_messages WHERE id = $1`,
      [messageId],
    );
    const msg = rows[0];
    if (!msg)
      throw new NotFoundException({
        code: ErrorCode.MESSAGE_NOT_FOUND,
        message: 'Message not found',
      });
    await this.chatMemberService.assertRoomMember(msg.roomId, userId);

    if (msg.senderId !== userId) {
      // Non-senders may only delete a message if this is a group/channel room
      // (not a 1-on-1 direct room) and they are the room owner/creator.
      const roomRows = await this.dataSource.query<{
        type: string;
        createdById: string;
      }>(
        `SELECT type, created_by AS "createdById" FROM chat_rooms WHERE id = $1`,
        [msg.roomId],
      );
      const room = roomRows[0];
      const isDirectRoom = room?.type === 'direct';
      const isRoomOwner = room?.createdById === userId;
      if (isDirectRoom || !isRoomOwner) {
        throw new ForbiddenException({
          code: ErrorCode.CANNOT_DELETE_MESSAGE,
          message: 'You can only delete your own messages',
        });
      }
    }
    await this.dataSource.query(
      `UPDATE chat_messages SET deleted_at = now() WHERE id = $1`,
      [messageId],
    );
    // Deletion happened over REST, so nothing had told the other members yet:
    // the message stayed on their screen until they reloaded.
    this.events.emit('chat.message_deleted', {
      roomId: msg.roomId,
      messageId,
      deletedBy: userId,
    });
  }

  async updateMessage(
    messageId: string,
    userId: string,
    dto: UpdateMessageDto,
  ) {
    const rows = await this.dataSource.query<ChatMessage>(
      `SELECT ${CHAT_MESSAGE_COLUMNS_SQL} FROM chat_messages WHERE id = $1`,
      [messageId],
    );
    const msg = rows[0];
    if (!msg || msg.deletedAt)
      throw new NotFoundException({
        code: ErrorCode.MESSAGE_NOT_FOUND,
        message: 'Message not found',
      });
    await this.chatMemberService.assertRoomMember(msg.roomId, userId);

    if (msg.senderId !== userId)
      throw new ForbiddenException({
        code: ErrorCode.CANNOT_EDIT_MESSAGE,
        message: 'You can only edit your own messages',
      });

    if (msg.contentType === 'document') {
      throw new ForbiddenException({
        code: ErrorCode.CANNOT_EDIT_MESSAGE,
        message: 'Long document messages cannot be edited',
      });
    }

    const roomRows = await this.dataSource.query<{
      id: string;
      type: string;
      scope: string;
      e2eeEpoch: number;
    }>(
      `SELECT id, type, scope, e2ee_epoch AS "e2eeEpoch" FROM chat_rooms WHERE id = $1`,
      [msg.roomId],
    );
    const plainText = (dto.content ?? '').trim();
    const envelope = await this.e2ee.assertMessageEncryption(
      roomRows[0],
      userId,
      dto.e2ee,
      !!plainText,
    );
    if (!plainText && !envelope)
      throw new BadRequestException({
        code: ErrorCode.MESSAGE_EMPTY,
        message: 'Message content is required',
      });

    let content: string;
    let contentJson: any;
    const isE2ee = !!envelope;
    if (envelope) {
      contentJson = envelope;
      content = '';
    } else if (this.chatEncryption.isEnabled()) {
      contentJson = this.chatEncryption.encrypt(plainText);
      content = '';
    } else {
      content = plainText;
      contentJson = null;
    }

    const editedAt = new Date();
    const savedRows: ChatMessage[] = await this.dataSource.query(
      `UPDATE chat_messages
         SET content = $2, content_json = $3, is_edited = true, edited_at = $4, is_e2ee = $5
         WHERE id = $1
         RETURNING ${CHAT_MESSAGE_COLUMNS_SQL}`,
      [messageId, content, contentJson, editedAt, isE2ee],
    );
    const saved = savedRows[0];
    // Same gap as deletion: an edit made over REST reached nobody until they
    // reloaded, so two people in the same room saw different text.
    this.events.emit('chat.message_updated', {
      roomId: msg.roomId,
      messageId,
      // Recipients need it to check an E2EE edit's associated data.
      senderId: msg.senderId,
      content: isE2ee ? null : plainText,
      e2ee: envelope,
      isEdited: true,
      editedAt,
    });
    return {
      ...saved,
      contentJson: undefined,
      content: isE2ee ? null : plainText,
      e2ee: envelope,
      editedAt: saved.editedAt,
    };
  }

  private mapToResponse(
    msg: ChatMessageRow,
    decryptedContent: string,
    attachments: MessageAttachment[] = [],
  ): ChatMessageResponse {
    return this.mapToResponseWithSender(
      msg,
      decryptedContent,
      msg.sender ?? null,
      attachments,
    );
  }

  private mapAttachment(a: MessageAttachment) {
    return {
      id: a.id,
      fileName: a.fileName,
      fileSize: Number(a.fileSize),
      mimeType: a.mimeType,
      url: a.storageUrl,
      width: a.width ?? null,
      height: a.height ?? null,
    };
  }

  private mapToResponseWithSender(
    msg: ChatMessageRow,
    decryptedContent: string,
    sender: MessageSender | null,
    attachments: MessageAttachment[] = [],
  ): ChatMessageResponse {
    return {
      id: msg.id,
      roomId: msg.roomId,
      senderId: msg.senderId,
      sequence: msg.sequence,
      clientMessageId: msg.clientMessageId,
      metadata: msg.metadata,
      content: msg.isE2ee
        ? null
        : msg.contentType === 'document'
          ? (msg.content ?? null)
          : decryptedContent,
      e2ee: msg.isE2ee ? ((msg.contentJson as E2eeEnvelope) ?? null) : null,
      contentType: msg.contentType ?? 'text',
      attachments: attachments.map((a) => this.mapAttachment(a)),
      replyToId: msg.replyToId ?? null,
      isThreadReply: msg.isThreadReply ?? false,
      isEdited: msg.isEdited ?? false,
      editedAt: msg.editedAt ?? null,
      createdAt: msg.createdAt,
      isSystem: msg.isSystem ?? false,
      systemMetadata: msg.systemMetadata ?? null,
      reactions: [],
      sender: sender
        ? {
            id: sender.id,
            firstName: sender.firstName ?? null,
            lastName: sender.lastName ?? null,
            avatarUrl: sender.avatarUrl ?? null,
          }
        : null,
    };
  }

  private static readonly THREAD_MESSAGE_SELECT_SQL = `
    m.id AS "id", m.room_id AS "roomId", m.sender_id AS "senderId",
    m.reply_to_id AS "replyToId", m.content, m.content_json AS "contentJson",
    m.content_type AS "contentType", m.is_edited AS "isEdited", m.edited_at AS "editedAt",
    m.is_thread_reply AS "isThreadReply", m.created_at AS "createdAt", m.updated_at AS "updatedAt",
    m.sequence, m.client_message_id AS "clientMessageId", m.metadata, m.is_e2ee AS "isE2ee",
    u.id AS "s_id", u.first_name AS "s_firstName", u.last_name AS "s_lastName", u.avatar_url AS "s_avatarUrl", u.name_emoji AS "s_nameEmoji", u.nickname AS "s_nickname"
  `;

  /** Slack-style thread: the root message plus its replies (is_thread_reply = true), oldest first. */
  async getThread(rootMessageId: string, userId: string) {
    const rootRows = await this.dataSource.query<any>(
      `SELECT ${ChatMessageService.THREAD_MESSAGE_SELECT_SQL}
       FROM chat_messages m LEFT JOIN users u ON u.id = m.sender_id
       WHERE m.id = $1 AND m.deleted_at IS NULL`,
      [rootMessageId],
    );
    const root = rootRows[0];
    if (!root)
      throw new NotFoundException({
        code: ErrorCode.MESSAGE_NOT_FOUND,
        message: 'Message not found',
      });
    await this.chatMemberService.assertRoomMember(root.roomId, userId);

    const replies = await this.dataSource.query<any>(
      `SELECT ${ChatMessageService.THREAD_MESSAGE_SELECT_SQL}
       FROM chat_messages m LEFT JOIN users u ON u.id = m.sender_id
       WHERE m.reply_to_id = $1 AND m.is_thread_reply = true AND m.deleted_at IS NULL
       ORDER BY m.sequence ASC`,
      [rootMessageId],
    );

    const allIds = [root.id, ...replies.map((r) => r.id)];
    const attachments = await this.dataSource.query<MessageAttachment>(
      `SELECT ${MESSAGE_ATTACHMENT_COLUMNS_SQL} FROM message_attachments WHERE message_id = ANY($1::uuid[])`,
      [allIds],
    );
    const attachmentsByMsg = new Map<string, MessageAttachment[]>();
    for (const a of attachments) {
      if (!attachmentsByMsg.has(a.messageId))
        attachmentsByMsg.set(a.messageId, []);
      attachmentsByMsg.get(a.messageId)!.push(a);
    }
    const sender = (row: any) =>
      row.s_id
        ? {
            id: row.s_id,
            firstName: row.s_firstName,
            lastName: row.s_lastName,
            avatarUrl: row.s_avatarUrl,
            nameEmoji: row.s_nameEmoji,
            nickname: row.s_nickname,
          }
        : null;
    const decrypt = (row: any) => this.bodyOf(row).content ?? '';

    return {
      root: this.mapToResponseWithSender(
        root,
        decrypt(root),
        sender(root),
        attachmentsByMsg.get(root.id) ?? [],
      ),
      replies: replies.map((r) =>
        this.mapToResponseWithSender(
          r,
          decrypt(r),
          sender(r),
          attachmentsByMsg.get(r.id) ?? [],
        ),
      ),
    };
  }

  /** Resolves the root message's room, then posts through the normal sendMessage pipeline. */
  async sendThreadReply(
    rootMessageId: string,
    userId: string,
    dto: SendMessageDto,
  ) {
    const rootRows = await this.dataSource.query<{ roomId: string }>(
      `SELECT room_id AS "roomId" FROM chat_messages WHERE id = $1 AND deleted_at IS NULL`,
      [rootMessageId],
    );
    const root = rootRows[0];
    if (!root)
      throw new NotFoundException({
        code: ErrorCode.MESSAGE_NOT_FOUND,
        message: 'Thread root message not found',
      });
    return this.sendMessage(root.roomId, userId, {
      ...dto,
      replyToId: rootMessageId,
      isThreadReply: true,
    });
  }

  /** Telegram-style unsent-message text for a room, restored when the user comes back. */
  async getDraft(roomId: string, userId: string): Promise<{ content: string }> {
    const rows = await this.dataSource.query<MessageDraft>(
      `SELECT content FROM message_drafts WHERE user_id = $1 AND room_id = $2`,
      [userId, roomId],
    );
    return { content: rows[0]?.content ?? '' };
  }

  async saveDraft(
    roomId: string,
    userId: string,
    content: string,
  ): Promise<{ content: string }> {
    await this.chatMemberService.assertRoomMember(roomId, userId);
    if (!content.trim()) {
      await this.dataSource.query(
        `DELETE FROM message_drafts WHERE user_id = $1 AND room_id = $2`,
        [userId, roomId],
      );
      return { content: '' };
    }
    const rows = await this.dataSource.query<MessageDraft>(
      `INSERT INTO message_drafts (user_id, room_id, content)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, room_id) DO UPDATE SET content = $3, updated_at = now()
       RETURNING content`,
      [userId, roomId, content],
    );
    return { content: rows[0].content };
  }
}
