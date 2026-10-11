import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { RedisService } from '../../redis/redis.service';

/** The bits of a media item the counters need. */
export interface CountedItem {
  id: string;
  durationSeconds: number;
  viewCount: number;
  likeCount: number;
}

const MIN_FLUSH_SECONDS = 3 * 60;
const MAX_FLUSH_SECONDS = 30 * 60;
/** A refresh or a quick back-and-forth inside this window isn't a new view. */
const VIEW_DEDUPE_SECONDS = 60;
const TICK_MS = 30_000;

const key = {
  views: (id: string) => `media:views:${id}`, // userId -> pending view count
  watch: (id: string) => `media:watch:${id}`, // userId -> pending seconds played
  likes: (id: string) => `media:likes:${id}`, // userId -> '1' | '0' (latest state)
  userLikes: (userId: string) => `media:ulikes:${userId}`, // mediaId -> '1' | '0'
  seen: (id: string, userId: string) => `media:seen:${id}:${userId}`,
  due: 'media:due', // zset: mediaId -> when to write it out (ms)
  lock: 'media:flush-lock',
};

/**
 * How long an item's views and likes may sit in Redis before they're written
 * to Postgres. A quarter of the item's length (a 20-minute video every 5 min,
 * a 22-minute one every 5.5) — quartered again past an hour — kept between 3
 * and 30 minutes, with ±10% jitter. Every item gets its own rhythm, so writes
 * spread out instead of all landing on the same tick.
 */
export function flushPeriodSeconds(durationSeconds: number, random = Math.random): number {
  let period = durationSeconds > 0 ? durationSeconds / 4 : MIN_FLUSH_SECONDS;
  if (durationSeconds > 3600) period /= 4;
  period = Math.min(MAX_FLUSH_SECONDS, Math.max(MIN_FLUSH_SECONDS, period));
  return Math.round(period * (0.9 + random() * 0.2));
}

// Atomically takes an item's pending views, likes and watch time, and clears them.
const TAKE_SCRIPT = `
local views = redis.call('HGETALL', KEYS[1])
local likes = redis.call('HGETALL', KEYS[2])
local watch = redis.call('HGETALL', KEYS[4])
redis.call('DEL', KEYS[1], KEYS[2], KEYS[4])
redis.call('ZREM', KEYS[3], ARGV[1])
return { views, likes, watch }`;

// After a flush: drop a person's pending like marker only if it still holds
// the value just written (they may have toggled again meanwhile).
const SETTLE_SCRIPT = `
for i = 1, #ARGV, 2 do
  local k = 'media:ulikes:' .. ARGV[i]
  if redis.call('HGET', k, KEYS[1]) == ARGV[i + 1] then redis.call('HDEL', k, KEYS[1]) end
end
return 1`;

/**
 * Views and likes for media items, collected in Redis and written to
 * Postgres in batches. Reads add what's still pending, so counts are live.
 * Without Redis everything goes straight to the database.
 */
@Injectable()
export class MediaCountersService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(MediaCountersService.name);
  private timer: NodeJS.Timeout | null = null;
  private flushing = false;

  constructor(
    private readonly db: DatabaseService,
    private readonly redisService: RedisService,
  ) {}

  private get redis() {
    return this.redisService.getClient();
  }

  onModuleInit() {
    this.timer = setInterval(() => void this.flushDue(), TICK_MS);
    this.timer.unref?.();
  }

  async onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
    await this.flushDue(true).catch(() => undefined);
  }

  // ── writes ──────────────────────────────────────────────

  /** Counts a view (at most one per person per minute). Returns the live total. */
  async recordView(item: CountedItem, userId: string): Promise<number> {
    const redis = this.redis;
    if (!redis) {
      await this.writeViews(item.id, [[userId, 1]]);
      const [row] = await this.db.query<{ n: string }>(
        `SELECT view_count AS n FROM media_items WHERE id = $1`,
        [item.id],
      );
      return Number(row?.n ?? 0);
    }
    const fresh = await redis.set(key.seen(item.id, userId), '1', 'EX', VIEW_DEDUPE_SECONDS, 'NX');
    if (fresh) {
      await redis.hincrby(key.views(item.id), userId, 1);
      await this.schedule(item);
    }
    return item.viewCount + (await this.pendingViews(item.id));
  }

  /** Seconds the player actually played (Spend Time). Clamped per report. */
  async recordWatch(item: CountedItem, userId: string, seconds: number) {
    const add = Math.max(0, Math.min(60, Math.round(seconds)));
    if (!add) return;
    const redis = this.redis;
    if (!redis) {
      await this.writeViews(item.id, [], [[userId, add]]);
      return;
    }
    await redis.hincrby(key.watch(item.id), userId, add);
    await this.schedule(item);
  }

  async setLike(item: CountedItem, userId: string, liked: boolean) {
    const redis = this.redis;
    if (!redis) {
      await this.writeLikes(item.id, [[userId, liked]]);
      return { liked, likes: await this.storedLikeCount(item.id) };
    }
    const value = liked ? '1' : '0';
    await redis
      .multi()
      .hset(key.likes(item.id), userId, value)
      .hset(key.userLikes(userId), item.id, value)
      .exec();
    await this.schedule(item);
    return { liked, likes: await this.likeCount(item) };
  }

  private async schedule(item: CountedItem) {
    const dueAt = Date.now() + flushPeriodSeconds(item.durationSeconds) * 1000;
    // NX: the first pending change sets the clock; later ones ride along.
    await this.redis?.zadd(key.due, 'NX', dueAt, item.id);
  }

  // ── reads ───────────────────────────────────────────────

  private async pendingViews(id: string) {
    const values = (await this.redis?.hvals(key.views(id))) ?? [];
    return values.reduce((sum, value) => sum + (Number(value) || 0), 0);
  }

  async viewCount(item: CountedItem) {
    return item.viewCount + (await this.pendingViews(item.id));
  }

  /** Stored count, corrected by pending likes that differ from what's stored. */
  async likeCount(item: CountedItem) {
    const pending = (await this.redis?.hgetall(key.likes(item.id))) ?? {};
    const users = Object.keys(pending);
    if (!users.length) return item.likeCount;
    const stored = await this.db.query<{ user_id: string }>(
      `SELECT user_id FROM media_likes WHERE media_id = $1 AND user_id = ANY($2::uuid[])`,
      [item.id, users],
    );
    const had = new Set(stored.map((row) => row.user_id));
    let delta = 0;
    for (const [userId, value] of Object.entries(pending)) {
      if (value === '1' && !had.has(userId)) delta++;
      if (value === '0' && had.has(userId)) delta--;
    }
    return Math.max(0, item.likeCount + delta);
  }

  async isLiked(itemId: string, userId: string) {
    const pending = await this.redis?.hget(key.userLikes(userId), itemId);
    if (pending === '1' || pending === '0') return pending === '1';
    const [row] = await this.db.query(
      `SELECT 1 FROM media_likes WHERE media_id = $1 AND user_id = $2`,
      [itemId, userId],
    );
    return Boolean(row);
  }

  /** Every item this person likes right now (stored + pending). */
  async likedIds(userId: string, provider: string): Promise<string[]> {
    const stored = await this.db.query<{ id: string }>(
      `SELECT l.media_id AS id FROM media_likes l JOIN media_items m ON m.id = l.media_id
        WHERE l.user_id = $1 AND m.provider = $2`,
      [userId, provider],
    );
    const ids = new Set(stored.map((row) => row.id));
    const pending = (await this.redis?.hgetall(key.userLikes(userId))) ?? {};
    for (const [id, value] of Object.entries(pending)) {
      if (value === '1') ids.add(id);
      else ids.delete(id);
    }
    return [...ids];
  }

  async myViews(itemId: string, userId: string) {
    const [row] = await this.db.query<{ n: number }>(
      `SELECT view_count AS n FROM media_views WHERE media_id = $1 AND user_id = $2`,
      [itemId, userId],
    );
    const pending = Number((await this.redis?.hget(key.views(itemId), userId)) ?? 0);
    return Number(row?.n ?? 0) + pending;
  }

  private async storedLikeCount(id: string) {
    const [row] = await this.db.query<{ n: string }>(
      `SELECT like_count AS n FROM media_items WHERE id = $1`,
      [id],
    );
    return Number(row?.n ?? 0);
  }

  // ── flushing ────────────────────────────────────────────

  /** Writes out every item whose time has come (or all of them, on shutdown). */
  async flushDue(all = false) {
    const redis = this.redis;
    if (!redis || this.flushing) return;
    this.flushing = true;
    try {
      // One instance flushes at a time.
      const locked = await redis.set(key.lock, '1', 'PX', TICK_MS - 2000, 'NX');
      if (!locked) return;
      const ids = await redis.zrangebyscore(key.due, '-inf', all ? '+inf' : Date.now(), 'LIMIT', 0, 200);
      for (const id of ids) await this.flushItem(id);
    } catch (error) {
      this.logger.warn(`media flush failed: ${error instanceof Error ? error.message : error}`);
    } finally {
      this.flushing = false;
    }
  }

  private async flushItem(id: string) {
    const redis = this.redis!;
    const [viewsFlat, likesFlat, watchFlat] = (await redis.eval(
      TAKE_SCRIPT, 4, key.views(id), key.likes(id), key.due, key.watch(id), id,
    )) as [string[], string[], string[]];
    const watch: Array<[string, number]> = [];
    for (let i = 0; i < watchFlat.length; i += 2) watch.push([watchFlat[i], Number(watchFlat[i + 1]) || 0]);
    const views: Array<[string, number]> = [];
    for (let i = 0; i < viewsFlat.length; i += 2) views.push([viewsFlat[i], Number(viewsFlat[i + 1]) || 0]);
    const likes: Array<[string, boolean]> = [];
    for (let i = 0; i < likesFlat.length; i += 2) likes.push([likesFlat[i], likesFlat[i + 1] === '1']);
    try {
      await this.writeViews(id, views, watch);
      await this.writeLikes(id, likes);
    } catch (error) {
      // Put everything back and try again on a later tick.
      const restore = redis.multi();
      for (const [userId, n] of views) restore.hincrby(key.views(id), userId, n);
      for (const [userId, n] of watch) restore.hincrby(key.watch(id), userId, n);
      for (const [userId, liked] of likes) restore.hsetnx(key.likes(id), userId, liked ? '1' : '0');
      restore.zadd(key.due, Date.now() + MIN_FLUSH_SECONDS * 1000, id);
      await restore.exec();
      throw error;
    }
    if (likes.length)
      await redis.eval(SETTLE_SCRIPT, 1, id, ...likes.flatMap(([userId, liked]) => [userId, liked ? '1' : '0']));
  }

  private async writeViews(id: string, views: Array<[string, number]>, watch: Array<[string, number]> = []) {
    const byUser = new Map<string, { views: number; seconds: number }>();
    for (const [userId, n] of views) if (n > 0) byUser.set(userId, { views: n, seconds: 0 });
    for (const [userId, n] of watch) if (n > 0) byUser.set(userId, { views: byUser.get(userId)?.views ?? 0, seconds: n });
    if (!byUser.size) return;
    const users = [...byUser.keys()];
    const totalViews = [...byUser.values()].reduce((sum, row) => sum + row.views, 0);
    await this.db.withTransaction(async (query) => {
      await query(
        `INSERT INTO media_views (media_id, user_id, view_count, watch_seconds)
         SELECT $1, u.user_id, u.n, u.s FROM unnest($2::uuid[], $3::int[], $4::int[]) AS u(user_id, n, s)
           JOIN users ON users.id = u.user_id
         ON CONFLICT (media_id, user_id) DO UPDATE
           SET view_count = media_views.view_count + EXCLUDED.view_count,
               watch_seconds = media_views.watch_seconds + EXCLUDED.watch_seconds,
               last_viewed_at = CASE WHEN EXCLUDED.view_count > 0 THEN now() ELSE media_views.last_viewed_at END`,
        [id, users, users.map((u) => byUser.get(u)!.views), users.map((u) => byUser.get(u)!.seconds)],
      );
      if (totalViews)
        await query(`UPDATE media_items SET view_count = view_count + $2, updated_at = now() WHERE id = $1`, [id, totalViews]);
    });
  }

  private async writeLikes(id: string, likes: Array<[string, boolean]>) {
    if (!likes.length) return;
    const on = likes.filter(([, liked]) => liked).map(([userId]) => userId);
    const off = likes.filter(([, liked]) => !liked).map(([userId]) => userId);
    await this.db.withTransaction(async (query) => {
      if (on.length)
        await query(
          `INSERT INTO media_likes (media_id, user_id)
           SELECT $1, u.id FROM users u WHERE u.id = ANY($2::uuid[])
           ON CONFLICT DO NOTHING`,
          [id, on],
        );
      if (off.length)
        await query(`DELETE FROM media_likes WHERE media_id = $1 AND user_id = ANY($2::uuid[])`, [id, off]);
      await query(
        `UPDATE media_items SET like_count = (SELECT count(*) FROM media_likes WHERE media_id = $1), updated_at = now() WHERE id = $1`,
        [id],
      );
    });
  }
}
