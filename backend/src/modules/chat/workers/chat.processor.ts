import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { NotificationType } from '../../../common/enums';
import { normalizeReturning } from '../../../common/utils/sql.util';

@Processor('chat')
export class ChatProcessor extends WorkerHost {
  private readonly logger = new Logger(ChatProcessor.name);

  constructor(
    private readonly dataSource: DatabaseService,
    private readonly notifications: NotificationsService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    switch (job.name) {
      case 'update-room-metadata':
        return this.handleUpdateRoomMetadata(job.data);
      case 'message-side-effects':
        return this.handleMessageSideEffects(job.data);
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }

  private async handleUpdateRoomMetadata(data: {
    roomId: string;
    sequence: number;
    lastMessageId: string;
    lastMessageAt: string;
  }) {
    // `message_seq < $2` makes this monotonic, and that guard is doing real
    // work rather than being defensive.
    //
    // The job dedupes on jobId = roomId, which in BullMQ keeps the *first*
    // job enqueued while one is pending — not the last. So during a burst the
    // room can be told about message #1 after #7 has already been recorded,
    // and an unconditional write walks the counter backwards. message_seq is
    // what unread counts are computed from (`messageSeq - lastReadSeq`), so a
    // rewind shows negative-clamped zeros and a stale sidebar preview until
    // the next message happens to arrive.
    const rows = await this.dataSource.query(
      `UPDATE chat_rooms
          SET message_seq = $2, last_message_id = $3, last_message_at = $4
        WHERE id = $1 AND message_seq < $2
        RETURNING id`,
      [
        data.roomId,
        data.sequence,
        data.lastMessageId,
        new Date(data.lastMessageAt),
      ],
    );
    if (!normalizeReturning(rows)[0]) {
      this.logger.debug(
        `Skipped stale metadata for room ${data.roomId} (sequence ${data.sequence})`,
      );
      return;
    }
    this.logger.debug(
      `Updated room ${data.roomId} metadata to sequence ${data.sequence}`,
    );
  }

  /**
   * Everything a message causes beyond being stored. Today that is mentions;
   * analytics and search indexing are the other intended tenants.
   *
   * It runs on the queue rather than inline because none of it should be able
   * to slow down — or fail — the send. A message that is saved and delivered
   * has succeeded, whatever happens to the notification about it.
   */
  private async handleMessageSideEffects(data: {
    messageId: string;
    roomId: string;
    senderId: string;
    sequence?: number;
    mentions?: string[];
  }) {
    await this.reopenDirectRoomForRecipients(data);
    await this.notifyMentions(data);
    this.logger.debug(`Processed side effects for message ${data.messageId}`);
  }

  /**
   * A new message reopens a direct conversation the recipient had deleted.
   *
   * "Delete chat" on a DM closes the caller's own membership rather than
   * destroying the room for both sides (see
   * ChatRoomService.deleteDirectRoomForMe). Without this, that deletion would
   * be permanent in one direction: the other person keeps writing into a room
   * the recipient is no longer a member of, so the messages arrive nowhere and
   * neither party is told. Telegram's behaviour — a deleted chat comes back
   * when the other person writes again — is also the only one that doesn't
   * silently drop conversation.
   *
   * Scoped to direct rooms: leaving a group or channel is a decision, and
   * being dragged back in by whoever posts next is not what it means.
   *
   * The read cursor is moved to just before this message, so the room returns
   * with one unread rather than a count reaching back to whenever they left.
   */
  private async reopenDirectRoomForRecipients(data: {
    roomId: string;
    senderId: string;
    sequence?: number;
  }): Promise<void> {
    if (typeof data.sequence !== 'number') return;

    const reopened = await this.dataSource.query<{ userId: string }>(
      `UPDATE chat_members cm
          SET left_at = NULL,
              status = 'active',
              last_read_seq = GREATEST(cm.last_read_seq, $3::int - 1)
         FROM chat_rooms r
        WHERE r.id = cm.room_id
          AND cm.room_id = $1
          AND cm.user_id <> $2
          AND cm.left_at IS NOT NULL
          AND r.type = 'direct'
        RETURNING cm.user_id AS "userId"`,
      [data.roomId, data.senderId, data.sequence],
    );
    const rows = normalizeReturning(reopened);
    if (rows.length) {
      this.logger.debug(
        `Reopened direct room ${data.roomId} for ${rows.length} recipient(s)`,
      );
    }
  }

  /**
   * Turns `@name` into a notification, for the people it actually refers to.
   *
   * The handles arrive as typed text, so every one of them is a claim and
   * nothing more. One query resolves them against the room's active
   * membership, which enforces all three rules at once: the name must belong
   * to a real account, that account must be a member of this room (otherwise
   * a mention is a way to poke strangers, or to learn whether a username
   * exists), and a member who muted the room stays muted.
   */
  private async notifyMentions(data: {
    messageId: string;
    roomId: string;
    senderId: string;
    mentions?: string[];
  }): Promise<void> {
    const handles = data.mentions ?? [];
    if (handles.length === 0) return;

    const settings = await this.dataSource.query<{
      mentionNotifications: boolean;
    }>(
      `SELECT mention_notifications AS "mentionNotifications"
         FROM channel_settings WHERE room_id = $1`,
      [data.roomId],
    );
    // Absent settings means the row hasn't been created yet, which is the
    // default-on case — only an explicit false turns mentions off.
    if (settings[0]?.mentionNotifications === false) return;

    const recipients = await this.dataSource.query<{
      id: string;
      firstName: string | null;
      lastName: string | null;
    }>(
      `SELECT u.id, u.first_name AS "firstName", u.last_name AS "lastName"
         FROM chat_members cm
         JOIN users u ON u.id = cm.user_id
        WHERE cm.room_id = $1
          AND cm.left_at IS NULL
          AND cm.status = 'active'
          AND cm.is_muted = false
          AND u.deleted_at IS NULL
          AND u.id <> $2
          AND lower(u.username) = ANY($3::text[])`,
      [data.roomId, data.senderId, handles],
    );
    if (recipients.length === 0) return;

    const [room] = await this.dataSource.query<{ name: string | null }>(
      `SELECT name FROM chat_rooms WHERE id = $1`,
      [data.roomId],
    );
    const [sender] = await this.dataSource.query<{
      firstName: string | null;
      lastName: string | null;
      username: string | null;
    }>(
      `SELECT first_name AS "firstName", last_name AS "lastName", username
         FROM users WHERE id = $1`,
      [data.senderId],
    );
    const senderName =
      [sender?.firstName, sender?.lastName].filter(Boolean).join(' ') ||
      sender?.username ||
      'Someone';
    const where = room?.name ? `#${room.name}` : 'a chat';

    // The message body is deliberately not carried into the notification.
    // Chat content is encrypted at rest, and a notification row — which is
    // also fanned out to SMS, Telegram and email — is the wrong place to
    // reintroduce a plaintext copy of it.
    for (const recipient of recipients) {
      await this.notifications.create({
        userId: recipient.id,
        actorId: data.senderId,
        type: NotificationType.MENTION,
        title: `${senderName} mentioned you`,
        message: `You were mentioned in ${where}.`,
        entityType: 'chat_message',
        entityId: data.messageId,
        actionUrl: `/chat?room=${data.roomId}&message=${data.messageId}`,
      });
    }
    this.logger.debug(
      `Notified ${recipients.length} mention(s) for message ${data.messageId}`,
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(
      `Job ${job.id} of type ${job.name} failed: ${err.message}`,
      err.stack,
    );
  }
}
