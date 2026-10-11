import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { RedisService } from '../../redis/redis.service';
import { classifyVideo, type ContentType } from './video-classifier';
import {
  capSuppressed, diversify, EMPTY_PROFILE, isSuppressed, provenanceScore, type RankedVideo, scoreVideo,
  SHORT_WATCH_SECONDS, type TypeStats, type ViewerProfile,
} from './video-ranking';
import { YoutubeService, type YoutubeVideo } from './youtube.service';

/**
 * Seed searches for the candidate pool, a few per refresh (rotating) so the
 * YouTube quota stays small: a search costs 100 units of the 10,000 a day.
 */
const SEED_QUERIES = [
  'software engineering explained', 'system design interview distributed systems', 'dasturlash darslari',
  'science explained documentary', 'business case study', 'technology podcast interview',
  'psychology research explained', 'book summary ideas explained', 'career development advice',
  'matematika darslari', 'ingliz tili darslari', 'программирование с нуля урок', 'machine learning explained',
  'history documentary', 'biznes darslari', 'научно-популярная лекция', 'productivity habits science', 'ielts preparation lesson',
];
const SEEDS_PER_REFRESH = 4;
const REFRESH_MS = 6 * 3600_000;
const PAGE_SIZE = 24;
const SESSION_SIZE = 240;

export interface FeedItem {
  youtubeVideoId: string;
  title: string;
  channelName: string;
  durationSeconds: number;
  views: number | null;
  contentType: ContentType;
  topics: string[];
}

type CatalogRow = RankedVideo & { rejected: boolean };

const CATALOG_COLUMNS = `youtube_video_id AS "youtubeVideoId", title, channel_id AS "channelId", channel_title AS "channelTitle",
  duration_seconds AS "durationSeconds", published_at AS "publishedAt", view_count AS "viewCount", like_count AS "likeCount",
  content_type AS "contentType", topics, educational, provenance, rejected`;

/**
 * The Optima video feed: YouTube → candidates → rule-based relevance filter
 * (video-classifier) → quality ranking (video-ranking) → the viewer's own
 * habits (Spend Time, frequency cap) → feed. No LLM anywhere: classification
 * happens once per video and is stored; ranking is arithmetic per request.
 */
@Injectable()
export class VideoFeedService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VideoFeedService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly db: DatabaseService,
    private readonly redisService: RedisService,
    private readonly youtube: YoutubeService,
  ) {}

  onModuleInit() {
    const run = () => void this.refreshCandidates().catch((error) => this.logger.warn(`feed refresh failed: ${error instanceof Error ? error.message : error}`));
    setTimeout(run, 20_000).unref?.();
    this.timer = setInterval(run, REFRESH_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // ── candidates ──────────────────────────────────────────

  /** Classifies videos (rules only) and stores them; returns them with their verdicts. */
  async ingest(input: YoutubeVideo[], source: 'search' | 'seed' | 'catalog'): Promise<CatalogRow[]> {
    // One row per video (a batch can repeat one, and an upsert can't touch a row twice).
    const videos = [...new Map(input.filter((video) => /^[A-Za-z0-9_-]{11}$/.test(video.youtubeVideoId)).map((video) => [video.youtubeVideoId, video])).values()];
    if (!videos.length) return [];
    const trusted = await this.trustedChannels();
    const rows: CatalogRow[] = videos.map((video) => {
      const verdict = classifyVideo({
        title: video.title, description: video.description, tags: video.tags, categoryId: video.categoryId,
        durationSeconds: video.durationSeconds, channelTitle: video.channelName,
      });
      return {
        youtubeVideoId: video.youtubeVideoId, title: video.title, channelId: video.channelId ?? '', channelTitle: video.channelName ?? '',
        durationSeconds: video.durationSeconds || 0, publishedAt: video.publishedAt, viewCount: video.views ?? null, likeCount: video.likes ?? null,
        contentType: verdict.contentType, topics: verdict.topics, educational: verdict.educational,
        provenance: provenanceScore(video.channelName ?? '', trusted.has(video.channelId ?? '') || trusted.has((video.channelName ?? '').toLowerCase())),
        rejected: verdict.rejected,
        reasons: verdict.reasons,
        description: video.description ?? '', tags: video.tags ?? [], categoryId: video.categoryId ?? null,
      } as CatalogRow & { reasons: string[]; description: string; tags: string[]; categoryId: string | null };
    });
    const values = rows as Array<CatalogRow & { reasons: string[]; description: string; tags: string[]; categoryId: string | null }>;
    await this.db.query(
      `INSERT INTO video_catalog (youtube_video_id, title, description, channel_id, channel_title, category_id, tags, duration_seconds,
         published_at, view_count, like_count, content_type, topics, educational, provenance, rejected, reasons, source, updated_at)
       SELECT * , now() FROM jsonb_to_recordset($1::jsonb) AS r(
         "youtubeVideoId" varchar, title text, description text, "channelId" varchar, "channelTitle" text, "categoryId" varchar, tags text[],
         "durationSeconds" int, "publishedAt" timestamptz, "viewCount" bigint, "likeCount" bigint, "contentType" varchar, topics text[],
         educational smallint, provenance smallint, rejected boolean, reasons text[], source varchar)
       ON CONFLICT (youtube_video_id) DO UPDATE SET
         title = EXCLUDED.title, description = EXCLUDED.description, channel_id = EXCLUDED.channel_id, channel_title = EXCLUDED.channel_title,
         category_id = COALESCE(EXCLUDED.category_id, video_catalog.category_id), tags = EXCLUDED.tags,
         duration_seconds = GREATEST(EXCLUDED.duration_seconds, video_catalog.duration_seconds),
         published_at = COALESCE(EXCLUDED.published_at, video_catalog.published_at),
         view_count = COALESCE(EXCLUDED.view_count, video_catalog.view_count), like_count = COALESCE(EXCLUDED.like_count, video_catalog.like_count),
         content_type = EXCLUDED.content_type, topics = EXCLUDED.topics, educational = EXCLUDED.educational,
         provenance = GREATEST(EXCLUDED.provenance, video_catalog.provenance), rejected = EXCLUDED.rejected, reasons = EXCLUDED.reasons,
         updated_at = now()`,
      [JSON.stringify(values.map((row) => ({
        youtubeVideoId: row.youtubeVideoId, title: row.title.slice(0, 500), description: row.description.slice(0, 1500), channelId: row.channelId,
        channelTitle: row.channelTitle, categoryId: row.categoryId, tags: row.tags, durationSeconds: row.durationSeconds,
        publishedAt: row.publishedAt, viewCount: row.viewCount, likeCount: row.likeCount, contentType: row.contentType, topics: row.topics,
        educational: row.educational, provenance: row.provenance, rejected: row.rejected, reasons: row.reasons, source,
      })))],
    );
    return rows;
  }

  /** Every few hours: a handful of seed searches + the curated catalogue. One instance at a time. */
  async refreshCandidates() {
    const redis = this.redisService.getClient();
    if (redis && !(await redis.set('video-feed:refresh-lock', '1', 'EX', 1800, 'NX'))) return;
    // The curated education catalogue is educational by construction.
    await this.db.query(
      `INSERT INTO video_catalog (youtube_video_id, title, description, channel_id, channel_title, duration_seconds, published_at,
         content_type, topics, educational, provenance, rejected, source)
       SELECT v.youtube_video_id, v.title, left(coalesce(v.description, ''), 1500), coalesce(c.youtube_channel_id, ''), coalesce(c.channel_name, ''),
              coalesce(v.duration_seconds, 0), v.published_at, 'lecture', ARRAY[]::text[], 85, 95, false, 'catalog'
         FROM education_videos v LEFT JOIN education_channels c ON c.id = v.channel_id
        WHERE coalesce(v.is_available, true) AND coalesce(v.is_short, false) = false AND v.youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'
       ON CONFLICT (youtube_video_id) DO NOTHING`,
    );
    await this.reclassifyAll();
    if (!this.youtube.enabled) return;
    const cursor = redis ? Number(await redis.incr('video-feed:seed-cursor')) : Math.floor(Date.now() / REFRESH_MS);
    for (let i = 0; i < SEEDS_PER_REFRESH; i++) {
      const query = SEED_QUERIES[((cursor - 1) * SEEDS_PER_REFRESH + i) % SEED_QUERIES.length];
      try {
        const result = await this.youtube.search(query, undefined, /[a-z]/.test(query) && !/[а-я]/.test(query) && !/darslar|biznes|matematika/.test(query) ? 'en' : /[а-я]/.test(query) ? 'ru' : 'uz');
        await this.ingest(result.items, 'seed');
      } catch (error) {
        this.logger.warn(`seed "${query}" failed: ${error instanceof Error ? error.message : error}`);
        break; // quota or key trouble — try again next round
      }
    }
  }

  /**
   * Re-runs the rules over everything stored (no YouTube calls), so tuning a
   * rule applies to the whole pool on the next refresh, not just to new videos.
   */
  async reclassifyAll() {
    const rows = await this.db.query<{ id: string; title: string; description: string; tags: string[]; category: string | null; duration: number; channel: string; source: string }>(
      `SELECT youtube_video_id AS id, title, description, tags, category_id AS category, duration_seconds AS duration, channel_title AS channel, source
         FROM video_catalog WHERE source <> 'catalog'`,
    );
    const updates = rows.map((row) => {
      const verdict = classifyVideo({ title: row.title, description: row.description, tags: row.tags, categoryId: row.category, durationSeconds: row.duration, channelTitle: row.channel });
      return { id: row.id, type: verdict.contentType, topics: verdict.topics, educational: verdict.educational, rejected: verdict.rejected, reasons: verdict.reasons };
    });
    for (let i = 0; i < updates.length; i += 500) {
      await this.db.query(
        `UPDATE video_catalog c SET content_type = u.type, topics = u.topics, educational = u.educational, rejected = u.rejected, reasons = u.reasons
           FROM jsonb_to_recordset($1::jsonb) AS u(id varchar, type varchar, topics text[], educational smallint, rejected boolean, reasons text[])
          WHERE c.youtube_video_id = u.id`,
        [JSON.stringify(updates.slice(i, i + 500))],
      );
    }
  }

  private async trustedChannels(): Promise<Set<string>> {
    const rows = await this.db.query<{ id: string; name: string }>(
      `SELECT coalesce(youtube_channel_id, '') AS id, lower(coalesce(channel_name, '')) AS name FROM education_channels WHERE is_active`,
    ).catch(() => []);
    return new Set(rows.flatMap((row) => [row.id, row.name]).filter(Boolean));
  }

  // ── the viewer ──────────────────────────────────────────

  /**
   * What this person watches: per content type (how much of it they play,
   * how often they leave within 5 minutes) and per topic. Cached 10 minutes.
   */
  async profile(userId: string): Promise<ViewerProfile> {
    const redis = this.redisService.getClient();
    const cacheKey = `video-feed:profile:${userId}`;
    try {
      const hit = await redis?.get(cacheKey);
      if (hit) return JSON.parse(hit) as ViewerProfile;
    } catch { /* recompute */ }
    const rows = await this.db.query<{ id: string; type: ContentType; topics: string[]; seconds: number; duration: number }>(
      `SELECT c.youtube_video_id AS id, c.content_type AS type, c.topics, mv.watch_seconds AS seconds, c.duration_seconds AS duration
         FROM media_views mv
         JOIN media_items m ON m.id = mv.media_id AND m.provider = 'youtube'
         JOIN video_catalog c ON c.youtube_video_id = m.external_id
        WHERE mv.user_id = $1
        ORDER BY mv.last_viewed_at DESC
        LIMIT 300`,
      [userId],
    );
    if (!rows.length) return EMPTY_PROFILE;
    const types: Partial<Record<ContentType, TypeStats & { short: number; sum: number }>> = {};
    const topicWeight: Record<string, number> = {};
    const watched: Record<string, number> = {};
    for (const row of rows) {
      const seconds = Number(row.seconds) || 0;
      const ratio = row.duration > 0 ? Math.min(1, seconds / row.duration) : seconds >= SHORT_WATCH_SECONDS ? 0.5 : 0.1;
      watched[row.id] = ratio;
      const stats = (types[row.type] ??= { samples: 0, avgRatio: 0, shortShare: 0, short: 0, sum: 0 });
      stats.samples++;
      stats.sum += ratio;
      if (seconds < SHORT_WATCH_SECONDS && ratio < 0.3) stats.short++;
      for (const topic of row.topics ?? []) topicWeight[topic] = (topicWeight[topic] ?? 0) + ratio;
    }
    const top = Math.max(0.0001, ...Object.values(topicWeight));
    const profile: ViewerProfile = {
      topics: Object.fromEntries(Object.entries(topicWeight).map(([topic, weight]) => [topic, Math.round((weight / top) * 100) / 100])),
      types: Object.fromEntries(Object.entries(types).map(([type, stats]) => [type, {
        samples: stats!.samples, avgRatio: stats!.sum / stats!.samples, shortShare: stats!.short / stats!.samples,
      }])),
      watched,
    };
    try { await redis?.set(cacheKey, JSON.stringify(profile), 'EX', 600); } catch { /* best-effort */ }
    return profile;
  }

  // ── feed & search ───────────────────────────────────────

  /** "For you": the stored pool, ranked for this person. Page 1 starts a session; later pages slice it. */
  async feed(userId: string, page = 1): Promise<{ items: FeedItem[]; hasMore: boolean }> {
    const redis = this.redisService.getClient();
    const sessionKey = `video-feed:session:${userId}`;
    let ids: string[] | null = null;
    if (page > 1) {
      try { ids = JSON.parse((await redis?.get(sessionKey)) ?? 'null'); } catch { ids = null; }
    }
    if (!ids) {
      const candidates = await this.db.query<CatalogRow>(
        `SELECT ${CATALOG_COLUMNS} FROM video_catalog WHERE NOT rejected ORDER BY educational DESC, provenance DESC LIMIT 600`,
      );
      const profile = await this.profile(userId);
      const scored = candidates.map((item) => ({ item, score: scoreVideo(item, profile).score }));
      const ordered = diversify(scored);
      // Frequency control across sessions.
      const capKey = `video-feed:cap:${userId}`;
      let state: { served: number; lastShown: Partial<Record<ContentType, number>> } = { served: 0, lastShown: {} };
      try { state = JSON.parse((await redis?.get(capKey)) ?? 'null') ?? state; } catch { /* fresh */ }
      const suppressed = new Set(Object.entries(profile.types).filter(([, stats]) => isSuppressed(stats)).map(([type]) => type as ContentType));
      const capped = capSuppressed(ordered, suppressed, state.served, state.lastShown, SESSION_SIZE);
      ids = capped.items.map((entry) => entry.item.youtubeVideoId);
      try {
        await redis?.set(capKey, JSON.stringify({ served: capped.served, lastShown: capped.lastShown }), 'EX', 30 * 86400);
        await redis?.set(sessionKey, JSON.stringify(ids), 'EX', 1800);
      } catch { /* best-effort */ }
    }
    const slice = ids.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const rows = slice.length ? await this.db.query<CatalogRow>(`SELECT ${CATALOG_COLUMNS} FROM video_catalog WHERE youtube_video_id = ANY($1)`, [slice]) : [];
    const byId = new Map(rows.map((row) => [row.youtubeVideoId, row]));
    return {
      items: slice.map((id) => byId.get(id)).filter((row): row is CatalogRow => Boolean(row && !row.rejected)).map(toFeedItem),
      hasMore: ids.length > page * PAGE_SIZE,
    };
  }

  /** A user's search: classified, rejected ones dropped, the rest ranked for them. */
  async rankSearch(userId: string, videos: YoutubeVideo[]): Promise<FeedItem[]> {
    const rows = await this.ingest(videos, 'search');
    const profile = await this.profile(userId);
    // Search keeps YouTube's relevance as a tie-breaker: earlier results get a small head start.
    return rows
      .map((item, index) => ({ item, score: scoreVideo(item, profile).score + Math.max(0, 6 - index * 0.5) }))
      .filter((entry) => !entry.item.rejected)
      .sort((a, b) => b.score - a.score)
      .map((entry) => toFeedItem(entry.item));
  }

  /** Is this video allowed on Optima at all? (Unknown → classified now.) */
  async isRejected(video: YoutubeVideo): Promise<boolean> {
    const [row] = await this.ingest([video], 'search');
    return Boolean(row?.rejected);
  }
}

function toFeedItem(row: RankedVideo): FeedItem {
  return {
    youtubeVideoId: row.youtubeVideoId, title: row.title, channelName: row.channelTitle, durationSeconds: row.durationSeconds,
    views: row.viewCount == null ? null : Number(row.viewCount), contentType: row.contentType, topics: row.topics,
  };
}
