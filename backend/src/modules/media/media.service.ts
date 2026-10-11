import {
  BadRequestException,
  Injectable,
  UnprocessableEntityException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { DatabaseService } from '../../database/database.service';
import { ErrorCode } from '../../common/enums/error-code.enum';
import { VideoFeedService } from '../youtube/video-feed.service';
import { YoutubeService, type YoutubeVideo } from '../youtube/youtube.service';
import { MediaCountersService } from './media-counters.service';

export type MediaProvider = 'youtube' | 'library';

export interface MediaItem {
  id: string;
  slug: string;
  provider: MediaProvider;
  externalId: string;
  title: string;
  subtitle: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number;
  meta: Record<string, unknown>;
  viewCount: number;
  likeCount: number;
}

const ITEM_COLUMNS = `id, slug, provider, external_id AS "externalId", title, subtitle,
  thumbnail_url AS "thumbnailUrl", duration_seconds AS "durationSeconds", meta,
  view_count::int AS "viewCount", like_count::int AS "likeCount"`;

const SLUG_ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** 8 characters from an alphabet without look-alikes (no 0/O, 1/l/I). */
export function newSlug(): string {
  const bytes = randomBytes(8);
  return Array.from(bytes, (byte) => SLUG_ALPHABET[byte % SLUG_ALPHABET.length]).join('');
}

/**
 * Our own record for a YouTube video or a library book: a short public slug
 * for its page, the provider's id, a little metadata, and running counts.
 */
@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly youtube: YoutubeService,
    private readonly counters: MediaCountersService,
    private readonly feed: VideoFeedService,
  ) {}

  /** Creates the record the first time an item is opened; later calls refresh its metadata. */
  async upsert(data: {
    provider: MediaProvider;
    externalId: string;
    title: string;
    subtitle?: string | null;
    thumbnailUrl?: string | null;
    durationSeconds?: number;
    meta?: Record<string, unknown>;
  }): Promise<MediaItem> {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const [row] = await this.db.query<MediaItem>(
          `INSERT INTO media_items (slug, provider, external_id, title, subtitle, thumbnail_url, duration_seconds, meta)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (provider, external_id) DO UPDATE SET
             title = EXCLUDED.title,
             subtitle = COALESCE(EXCLUDED.subtitle, media_items.subtitle),
             thumbnail_url = COALESCE(EXCLUDED.thumbnail_url, media_items.thumbnail_url),
             duration_seconds = GREATEST(EXCLUDED.duration_seconds, media_items.duration_seconds),
             meta = media_items.meta || EXCLUDED.meta,
             updated_at = now()
           RETURNING ${ITEM_COLUMNS}`,
          [
            newSlug(),
            data.provider,
            data.externalId,
            data.title.slice(0, 500) || data.externalId,
            data.subtitle?.slice(0, 300) ?? null,
            data.thumbnailUrl ?? null,
            Math.max(0, Math.round(data.durationSeconds ?? 0)),
            data.meta ?? {},
          ],
        );
        return row;
      } catch (error) {
        // Another item already has this slug — draw again.
        if ((error as { code?: string }).code === '23505' && String((error as Error).message).includes('slug')) continue;
        throw error;
      }
    }
    throw new Error('Could not allocate a media slug');
  }

  /** Registers a YouTube video by id; details come from YouTube, never from the client. */
  async youtubeVideo(videoId: string) {
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId))
      throw new BadRequestException({ code: ErrorCode.VALIDATION_ERROR, message: 'Invalid YouTube video id' });
    const details = await this.youtubeDetails(videoId);
    // Off-topic for Optima (pranks, music, films, games…) is never shown — a pasted link included.
    const candidate: YoutubeVideo = {
      youtubeVideoId: videoId, title: details.title, channelName: details.channelName, channelId: details.channelId ?? '',
      publishedAt: null, durationSeconds: details.durationSeconds, views: details.views,
      categoryId: details.categoryId ?? null, tags: details.tags ?? [], description: details.description ?? '', likes: details.likes ?? null,
    };
    if (details.title && (await this.feed.isRejected(candidate)))
      throw new UnprocessableEntityException({ code: ErrorCode.VALIDATION_ERROR, message: 'This video is not available on Optima — it is not educational content' });
    return this.upsert({
      provider: 'youtube',
      externalId: videoId,
      title: details.title || 'YouTube',
      subtitle: details.channelName || null,
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      durationSeconds: details.durationSeconds,
      meta: details.views != null ? { youtubeViews: details.views } : {},
    });
  }

  /**
   * Title / channel / duration from the YouTube API when there's a key, else
   * from our education catalogue, else from YouTube's keyless oEmbed.
   */
  private async youtubeDetails(videoId: string): Promise<{ title: string; channelName: string; durationSeconds: number; views: number | null } & Partial<YoutubeVideo>> {
    try {
      const video = await this.youtube.video(videoId);
      if (video) return video;
    } catch {
      /* no key / quota — fall back */
    }
    const [catalogue] = await this.db.query<{ title: string; channelName: string; durationSeconds: number }>(
      `SELECT v.title, c.channel_name AS "channelName", v.duration_seconds AS "durationSeconds"
         FROM education_videos v JOIN education_channels c ON c.id = v.channel_id
        WHERE v.youtube_video_id = $1 LIMIT 1`,
      [videoId],
    ).catch(() => []);
    if (catalogue) return { ...catalogue, durationSeconds: Number(catalogue.durationSeconds) || 0, views: null };
    try {
      const response = await fetch(
        `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (response.ok) {
        const data = (await response.json()) as { title?: string; author_name?: string };
        return { title: data.title ?? '', channelName: data.author_name ?? '', durationSeconds: 0, views: null };
      }
    } catch (error) {
      this.logger.debug(`oEmbed failed for ${videoId}: ${error instanceof Error ? error.message : error}`);
    }
    return { title: '', channelName: '', durationSeconds: 0, views: null };
  }

  async bySlug(slug: string): Promise<MediaItem> {
    if (!/^[A-Za-z0-9]{4,16}$/.test(slug)) throw this.notFound();
    const [row] = await this.db.query<MediaItem>(`SELECT ${ITEM_COLUMNS} FROM media_items WHERE slug = $1`, [slug]);
    if (!row) throw this.notFound();
    return row;
  }

  async byExternal(provider: MediaProvider, externalId: string): Promise<MediaItem | null> {
    const [row] = await this.db.query<MediaItem>(
      `SELECT ${ITEM_COLUMNS} FROM media_items WHERE provider = $1 AND external_id = $2`,
      [provider, externalId],
    );
    return row ?? null;
  }

  async byIds(ids: string[]): Promise<MediaItem[]> {
    if (!ids.length) return [];
    return this.db.query<MediaItem>(`SELECT ${ITEM_COLUMNS} FROM media_items WHERE id = ANY($1::uuid[])`, [ids]);
  }

  /** The page's view of an item: public fields plus live counts and this person's state. */
  async describe(item: MediaItem, userId: string) {
    const [views, likes, liked, myViews, progress] = await Promise.all([
      this.counters.viewCount(item),
      this.counters.likeCount(item),
      this.counters.isLiked(item.id, userId),
      this.counters.myViews(item.id, userId),
      this.progress(item.id, userId),
    ]);
    return {
      slug: item.slug,
      provider: item.provider,
      externalId: item.externalId,
      title: item.title,
      subtitle: item.subtitle,
      thumbnailUrl: item.thumbnailUrl,
      durationSeconds: item.durationSeconds,
      meta: item.meta,
      views,
      likes,
      liked,
      myViews,
      progress,
    };
  }

  /** Where this person stopped (books), or null. */
  async progress(itemId: string, userId: string) {
    const [row] = await this.db.query<{ position: number; page: number; totalPages: number; updatedAt: Date }>(
      `SELECT position, page, total_pages AS "totalPages", updated_at AS "updatedAt"
         FROM media_progress WHERE media_id = $1 AND user_id = $2`,
      [itemId, userId],
    );
    return row ? { ...row, position: Number(row.position) } : null;
  }

  /** The reader saves this every couple of minutes and when it closes. */
  async saveProgress(item: MediaItem, userId: string, body: { position?: unknown; page?: unknown; totalPages?: unknown }) {
    const position = Number(body?.position);
    if (!Number.isFinite(position) || position < 0 || position > 1)
      throw new BadRequestException({ code: ErrorCode.VALIDATION_ERROR, message: 'position must be between 0 and 1' });
    const whole = (value: unknown) => Math.max(0, Math.min(1_000_000, Math.round(Number(value) || 0)));
    await this.db.query(
      `INSERT INTO media_progress (media_id, user_id, position, page, total_pages, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (media_id, user_id) DO UPDATE
         SET position = EXCLUDED.position, page = EXCLUDED.page, total_pages = EXCLUDED.total_pages, updated_at = now()`,
      [item.id, userId, position, whole(body?.page), whole(body?.totalPages)],
    );
    return { position };
  }

  private notFound() {
    return new NotFoundException({ code: ErrorCode.NOT_FOUND, message: 'Not found' });
  }
}
