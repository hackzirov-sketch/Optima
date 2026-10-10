import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  ForbiddenException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../../../database/database.service';
import { RedisService } from '../../../redis/redis.service';
import { ErrorCode } from '../../../common/enums/error-code.enum';

/** How often the buffer is drained into Postgres. */
const FLUSH_INTERVAL_MS = 10_000;

/** Messages drained per tick — bounds one transaction's size under a spike. */
const MAX_MESSAGES_PER_FLUSH = 500;

const viewersKey = (messageId: string) => `message:${messageId}:viewers`;
const PENDING_KEY = 'message:views:pending';

/**
 * View tracking, buffered in Redis and written in batches.
 *
 * A view is the highest-frequency event in the product — every message that
 * scrolls past every member produces one — and the naive implementation is one
 * INSERT per view. Redis absorbs them instead: `SADD` makes a repeat view from
 * the same person free (a Set stores them once no matter how many times they
 * scroll back), and a worker drains the whole buffer every 10 seconds into a
 * single bulk INSERT ... ON CONFLICT DO NOTHING.
 *
 * The API therefore answers in the time of one Redis round-trip, and Postgres
 * sees one write per 10 seconds instead of thousands.
 *
 * With Redis unavailable this degrades to writing straight to Postgres —
 * slower, but views keep working rather than silently vanishing.
 */
@Injectable()
export class MessageViewService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MessageViewService.name);
  private timer: NodeJS.Timeout | null = null;
  private flushing = false;

  constructor(
    private readonly dataSource: DatabaseService,
    private readonly redisService: RedisService,
    private readonly events: EventEmitter2,
  ) {}

  onModuleInit() {
    // unref() so a pending tick never holds the process open during shutdown.
    this.timer = setInterval(() => {
      void this.flush();
    }, FLUSH_INTERVAL_MS);
    this.timer.unref();
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    // Drain what's buffered rather than losing the last window on deploy.
    await this.flush();
  }

  /**
   * Records that `userId` has seen these messages. Membership is checked once
   * for the room, not once per message — they all belong to the same room.
   */
  async recordViews(roomId: string, userId: string, messageIds: string[]) {
    if (messageIds.length === 0) return { buffered: 0 };

    const member = await this.dataSource.query(
      `SELECT 1 FROM chat_members
        WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL AND status = 'active'`,
      [roomId, userId],
    );
    if (!member[0])
      throw new ForbiddenException({
        code: ErrorCode.NOT_ROOM_MEMBER,
        message: 'Not a member of this chat room',
      });

    // Only messages that really belong to this room, so a caller can't inflate
    // the view count of a message in a room they aren't in by naming its id.
    const owned = await this.dataSource.query<{ id: string }>(
      `SELECT id FROM chat_messages
        WHERE id = ANY($1::uuid[]) AND room_id = $2 AND deleted_at IS NULL
          AND sender_id IS DISTINCT FROM $3`,
      [messageIds.slice(0, MAX_MESSAGES_PER_FLUSH), roomId, userId],
    );
    if (owned.length === 0) return { buffered: 0 };

    const client = this.redisService.getClient();
    if (!client) {
      await this.persist(owned.map((row) => ({ messageId: row.id, userId })));
      return { buffered: owned.length };
    }

    const pipeline = client.pipeline();
    for (const row of owned) {
      pipeline.sadd(viewersKey(row.id), userId);
      // The buffer is only discoverable through this index — without it the
      // flusher would have to SCAN the keyspace every 10 seconds.
      pipeline.sadd(PENDING_KEY, row.id);
    }
    await pipeline.exec();
    return { buffered: owned.length };
  }

  /**
   * Drains the buffer. Safe to call concurrently — the `flushing` guard keeps
   * a slow tick from overlapping the next one and double-counting.
   */
  async flush(): Promise<number> {
    if (this.flushing) return 0;
    const client = this.redisService.getClient();
    if (!client) return 0;

    this.flushing = true;
    // What has been taken out of Redis but not yet committed to Postgres.
    // SPOP and RENAME both remove data the moment they run, so between them
    // and a successful INSERT the only copy of these views lives in this
    // process — a crash, an OOM kill or a failed transaction in that window
    // used to drop the batch silently. Restored in the catch below so the
    // next tick picks them up again.
    let claimedIds: string[] = [];
    const staged: string[] = [];
    try {
      const messageIds = await client.spop(PENDING_KEY, MAX_MESSAGES_PER_FLUSH);
      if (!messageIds || messageIds.length === 0) return 0;
      claimedIds = messageIds;

      const pairs: Array<{ messageId: string; userId: string }> = [];
      const perMessage = new Map<string, number>();

      for (const messageId of messageIds) {
        // RENAME then read: a viewer arriving mid-flush lands in a freshly
        // created key and is picked up next tick, rather than being read and
        // then deleted out from under itself.
        const staging = `${viewersKey(messageId)}:flushing`;
        try {
          await client.rename(viewersKey(messageId), staging);
        } catch {
          continue; // key vanished — already drained
        }
        staged.push(messageId);
        const viewers = await client.smembers(staging);
        if (viewers.length === 0) {
          await client.del(staging);
          continue;
        }
        perMessage.set(messageId, viewers.length);
        for (const userId of viewers) pairs.push({ messageId, userId });
      }

      if (pairs.length === 0) {
        claimedIds = [];
        return 0;
      }
      const inserted = await this.persist(pairs);
      // Only once Postgres has the rows. Deleting the staging keys before the
      // insert committed is what made a failed transaction a silent loss.
      const cleanup = client.pipeline();
      for (const messageId of staged)
        cleanup.del(`${viewersKey(messageId)}:flushing`);
      await cleanup.exec();
      claimedIds = [];

      this.emitCounts(perMessage);
      return inserted;
    } catch (err) {
      this.logger.error(
        `View flush failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
      await this.restoreClaimed(claimedIds, staged);
      return 0;
    } finally {
      this.flushing = false;
    }
  }

  /**
   * Puts a failed batch back where the next tick will find it: staged viewer
   * sets are merged back into their live key, and the message ids return to
   * the pending index. Best-effort — if Redis itself is what failed there is
   * nothing to restore into, and the views are lost either way; this covers
   * the far more common case of a Postgres error or a restart.
   */
  private async restoreClaimed(claimedIds: string[], staged: string[]) {
    if (claimedIds.length === 0) return;
    const client = this.redisService.getClient();
    if (!client) return;
    try {
      for (const messageId of staged) {
        const staging = `${viewersKey(messageId)}:flushing`;
        const viewers = await client.smembers(staging);
        if (viewers.length)
          await client.sadd(viewersKey(messageId), ...viewers);
        await client.del(staging);
      }
      await client.sadd(PENDING_KEY, ...claimedIds);
      this.logger.warn(
        `Returned ${claimedIds.length} message(s) to the view buffer after a failed flush`,
      );
    } catch (err) {
      this.logger.error(
        `Could not restore the view buffer: ${(err as Error).message}`,
      );
    }
  }

  /**
   * One bulk INSERT plus one counter update, in a transaction so the
   * denormalised `view_count` can never disagree with the rows behind it.
   * `ON CONFLICT DO NOTHING` makes a redelivered batch a no-op, and the
   * counter is derived from what was actually inserted rather than from the
   * batch size — so re-counting the same viewer twice is impossible.
   */
  private async persist(
    pairs: Array<{ messageId: string; userId: string }>,
  ): Promise<number> {
    if (pairs.length === 0) return 0;

    return this.dataSource.withTransaction(async (query) => {
      const values: string[] = [];
      const params: unknown[] = [];
      pairs.forEach((pair, index) => {
        values.push(`($${index * 2 + 1}::uuid, $${index * 2 + 2}::uuid)`);
        params.push(pair.messageId, pair.userId);
      });

      // Only pairs whose message and user still exist. A view buffered for a
      // message deleted before the flush used to fail the whole batch on the
      // foreign key — and since a failed batch is restored and retried, that
      // one row blocked every view from being counted, forever.
      const inserted = await query<{ messageId: string }>(
        `INSERT INTO message_views (message_id, user_id)
         SELECT v.message_id, v.user_id
           FROM (VALUES ${values.join(', ')}) AS v(message_id, user_id)
           JOIN chat_messages m ON m.id = v.message_id
           JOIN users u ON u.id = v.user_id
         ON CONFLICT (message_id, user_id) DO NOTHING
         RETURNING message_id AS "messageId"`,
        params,
      );
      if (inserted.length === 0) return 0;

      await query(
        `UPDATE chat_messages m
            SET view_count = m.view_count + c.n
           FROM (
             SELECT id, count(*)::int AS n
               FROM unnest($1::uuid[]) AS t(id)
              GROUP BY id
           ) c
          WHERE m.id = c.id`,
        [inserted.map((row) => row.messageId)],
      );
      return inserted.length;
    });
  }

  /** Lets the gateway push fresh counts without this service knowing about it. */
  private emitCounts(perMessage: Map<string, number>) {
    if (perMessage.size === 0) return;
    this.events.emit('chat.views_updated', {
      messageIds: [...perMessage.keys()],
    });
  }

  /**
   * Who has read a message.
   *
   * Only the author may ask: in a group the read list is the author's own
   * delivery receipt, and exposing it to everyone turns a chat into a
   * presence-tracking tool. Channels report a count instead — a channel's
   * audience is not a list its members are entitled to enumerate.
   */
  async listViewers(messageId: string, userId: string) {
    const rows = await this.dataSource.query<{
      senderId: string | null;
      roomId: string;
      type: string;
      viewsCount: number;
    }>(
      `SELECT m.sender_id AS "senderId", m.room_id AS "roomId",
              r.type, m.view_count AS "viewsCount"
         FROM chat_messages m
         JOIN chat_rooms r ON r.id = m.room_id
        WHERE m.id = $1`,
      [messageId],
    );
    const message = rows[0];
    if (!message)
      throw new ForbiddenException({
        code: ErrorCode.MESSAGE_NOT_FOUND,
        message: 'Message not found',
      });

    // Before anything is reported, including the bare count. The channel
    // branch below used to return ahead of every check, so knowing a message
    // id was enough to read the reach of a post in a channel the caller had
    // no access to.
    const member = await this.dataSource.query(
      `SELECT 1 FROM chat_members
        WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL AND status = 'active'`,
      [message.roomId, userId],
    );
    if (!member[0])
      throw new ForbiddenException({
        code: ErrorCode.NOT_ROOM_MEMBER,
        message: 'Not a member of this chat room',
      });

    if (message.type === 'channel')
      return { count: message.viewsCount, viewers: null };

    if (message.senderId !== userId)
      throw new ForbiddenException({
        code: ErrorCode.INSUFFICIENT_PERMISSIONS,
        message: 'Only the author can see who read a message',
      });

    const viewers = await this.dataSource.query<{
      id: string;
      firstName: string;
      lastName: string;
      username: string | null;
      avatarUrl: string | null;
      viewedAt: Date;
    }>(
      `SELECT u.id, u.first_name AS "firstName", u.last_name AS "lastName",
              u.username, u.avatar_url AS "avatarUrl", v.viewed_at AS "viewedAt"
         FROM message_views v
         JOIN users u ON u.id = v.user_id
        WHERE v.message_id = $1
        ORDER BY v.viewed_at DESC
        LIMIT 200`,
      [messageId],
    );
    return { count: message.viewsCount, viewers };
  }
}
