import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { RedisService } from '../../redis/redis.service';

export interface YoutubeVideo {
  youtubeVideoId: string;
  title: string;
  channelName: string;
  channelId: string;
  publishedAt: string | null;
  durationSeconds: number;
  views: number | null;
  /** For the classifier (video-classifier.ts); not all are always present. */
  likes?: number | null;
  categoryId?: string | null;
  tags?: string[];
  description?: string;
}

/** ISO-8601 duration (PT1H2M3S) to seconds. */
function seconds(duration?: string): number {
  const match = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(
    duration ?? '',
  );
  if (!match) return 0;
  const [, d, h, m, s] = match.map((part) => Number(part || 0));
  return d * 86400 + h * 3600 + m * 60 + s;
}

/**
 * YouTube search and the Uzbekistan "popular" chart, through the Data API.
 *
 * A search costs 100 of the daily 10,000 quota units, so results are cached
 * in Redis (6 h for searches, 1 h for the chart) and every viewer of the same
 * query shares one call. Without YOUTUBE_API_KEY this answers 503 and the
 * page falls back to the curated education catalogue.
 */
@Injectable()
export class YoutubeService {
  private readonly logger = new Logger(YoutubeService.name);
  private readonly key: string;
  private readonly referer: string;

  constructor(
    config: ConfigService,
    private readonly redis: RedisService,
  ) {
    this.key = config.get<string>('YOUTUBE_API_KEY')?.trim() || '';
    // A key restricted to HTTP referrers (the usual "browser key") rejects
    // server calls that carry none. Send the site's own address, which has
    // to be on the key's allowed list — or restrict the key by IP instead.
    this.referer =
      config.get<string>('YOUTUBE_API_REFERER')?.trim() ||
      config.get<string>('FRONTEND_URL')?.trim() ||
      '';
  }

  get enabled() {
    return Boolean(this.key);
  }

  async search(query: string, pageToken?: string, language = 'uz') {
    const q = query.normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, 100);
    if (!q) return this.popular(pageToken);
    const params = new URLSearchParams({
      part: 'snippet',
      type: 'video',
      maxResults: '24',
      safeSearch: 'moderate',
      videoEmbeddable: 'true',
      regionCode: 'UZ',
      relevanceLanguage: /^[a-z]{2}$/.test(language) ? language : 'uz',
      q,
    });
    if (pageToken) params.set('pageToken', pageToken);
    return this.cached(`v2:search?${params}`, 6 * 3600, async () => {
      const result = await this.call<{
        nextPageToken?: string;
        items?: Array<{ id?: { videoId?: string } }>;
      }>(`search?${params}`);
      const ids = (result.items ?? [])
        .map((item) => item.id?.videoId)
        .filter((id): id is string => Boolean(id));
      return {
        items: await this.details(ids),
        nextPageToken: result.nextPageToken ?? null,
      };
    });
  }

  /**
   * "Popular in Uzbekistan": YouTube has no Uzbek trending chart (regionCode
   * UZ is rejected there), so this is the week's most-viewed Uzbek-language
   * videos. A search costs 100 units; cached for an hour.
   */
  async popular(pageToken?: string) {
    const weekAgo = new Date(Date.now() - 7 * 86400_000);
    weekAgo.setUTCHours(0, 0, 0, 0);
    const params = new URLSearchParams({
      part: 'snippet',
      type: 'video',
      maxResults: '24',
      order: 'viewCount',
      safeSearch: 'moderate',
      videoEmbeddable: 'true',
      regionCode: 'UZ',
      relevanceLanguage: 'uz',
      // RFC 3339 without milliseconds — with them YouTube silently returns nothing.
      publishedAfter: weekAgo.toISOString().replace(/\.\d{3}Z$/, 'Z'),
      // Without a query YouTube ignores the language hint entirely.
      q: "uzbek|o'zbek|узбек",
    });
    if (pageToken) params.set('pageToken', pageToken);
    return this.cached(`v2:popular?${params}`, 3600, async () => {
      const result = await this.call<{
        nextPageToken?: string;
        items?: Array<{ id?: { videoId?: string } }>;
      }>(`search?${params}`);
      const ids = (result.items ?? [])
        .map((item) => item.id?.videoId)
        .filter((id): id is string => Boolean(id));
      return {
        items: await this.details(ids),
        nextPageToken: result.nextPageToken ?? null,
      };
    });
  }

  /** One video's details (title, channel, duration), cached for a day. Needs the API key. */
  async video(id: string): Promise<YoutubeVideo | null> {
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
    const found = await this.cached(`v2:video?${id}`, 24 * 3600, async () => ({
      items: await this.details([id]),
    }));
    return found.items[0] ?? null;
  }

  /**
   * The full description card for the watch page: the video (long
   * description, tags, date, views, likes) and its channel (avatar, handle,
   * subscribers). Cached for six hours; 2 units when cold.
   */
  async watchDetails(id: string) {
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
    return this.cached(`v1:watch?${id}`, 6 * 3600, async () => {
      const result = await this.call<{ items?: unknown[] }>(
        `videos?${new URLSearchParams({ part: 'snippet,statistics', id })}`,
      );
      const raw = result.items?.[0] as
        | {
            snippet?: { title?: string; description?: string; tags?: string[]; publishedAt?: string; channelId?: string; channelTitle?: string };
            statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
          }
        | undefined;
      if (!raw) return null;
      const channelId = raw.snippet?.channelId ?? '';
      let channel: { id: string; title: string; handle: string | null; avatarUrl: string | null; subscribers: number | null } | null = null;
      if (channelId) {
        const found = await this.call<{ items?: unknown[] }>(
          `channels?${new URLSearchParams({ part: 'snippet,statistics', id: channelId })}`,
        ).catch(() => ({ items: [] }));
        const item = found.items?.[0] as
          | {
              snippet?: { title?: string; customUrl?: string; thumbnails?: { default?: { url?: string }; medium?: { url?: string } } };
              statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean };
            }
          | undefined;
        if (item)
          channel = {
            id: channelId,
            title: item.snippet?.title ?? raw.snippet?.channelTitle ?? '',
            handle: item.snippet?.customUrl ?? null,
            avatarUrl: item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url ?? null,
            subscribers: item.statistics?.hiddenSubscriberCount || !item.statistics?.subscriberCount ? null : Number(item.statistics.subscriberCount),
          };
      }
      const number = (value?: string) => (value ? Number(value) : null);
      return {
        description: (raw.snippet?.description ?? '').slice(0, 5000),
        tags: (raw.snippet?.tags ?? []).slice(0, 15),
        publishedAt: raw.snippet?.publishedAt ?? null,
        views: number(raw.statistics?.viewCount),
        likes: number(raw.statistics?.likeCount),
        comments: number(raw.statistics?.commentCount),
        channel: channel ?? (channelId ? { id: channelId, title: raw.snippet?.channelTitle ?? '', handle: null, avatarUrl: null, subscribers: null } : null),
      };
    });
  }

  /** Durations and view counts — search results carry neither. 1 unit per call. */
  private async details(ids: string[]) {
    if (!ids.length) return [];
    const params = new URLSearchParams({
      part: 'snippet,contentDetails,statistics',
      id: ids.join(','),
    });
    const result = await this.call<{ items?: unknown[] }>(`videos?${params}`);
    const byId = new Map(
      (result.items ?? []).map((item) => {
        const video = this.toVideo(item);
        return [video.youtubeVideoId, video];
      }),
    );
    return ids
      .map((id) => byId.get(id))
      .filter((video): video is YoutubeVideo => Boolean(video));
  }

  private toVideo(raw: unknown): YoutubeVideo {
    const item = raw as {
      id: string;
      snippet?: {
        title?: string;
        channelTitle?: string;
        channelId?: string;
        publishedAt?: string;
        categoryId?: string;
        tags?: string[];
        description?: string;
      };
      contentDetails?: { duration?: string };
      statistics?: { viewCount?: string; likeCount?: string };
    };
    return {
      youtubeVideoId: item.id,
      title: item.snippet?.title ?? '',
      channelName: item.snippet?.channelTitle ?? '',
      channelId: item.snippet?.channelId ?? '',
      publishedAt: item.snippet?.publishedAt ?? null,
      durationSeconds: seconds(item.contentDetails?.duration),
      views: item.statistics?.viewCount
        ? Number(item.statistics.viewCount)
        : null,
      likes: item.statistics?.likeCount ? Number(item.statistics.likeCount) : null,
      categoryId: item.snippet?.categoryId ?? null,
      tags: (item.snippet?.tags ?? []).slice(0, 30),
      description: (item.snippet?.description ?? '').slice(0, 1500),
    };
  }

  private async call<T>(path: string): Promise<T> {
    if (!this.key)
      throw new ServiceUnavailableException({
        code: 'YOUTUBE_NOT_CONFIGURED',
        message: 'YouTube search is not configured on this server',
      });
    const separator = path.includes('?') ? '&' : '?';
    let response: Response;
    try {
      response = await fetch(
        `https://www.googleapis.com/youtube/v3/${path}${separator}key=${encodeURIComponent(this.key)}`,
        {
          signal: AbortSignal.timeout(12000),
          headers: this.referer
            ? {
                Referer: this.referer.endsWith('/')
                  ? this.referer
                  : `${this.referer}/`,
              }
            : undefined,
        },
      );
    } catch (error) {
      this.logger.warn(`YouTube API unreachable: ${(error as Error).message}`);
      throw new ServiceUnavailableException({
        code: 'YOUTUBE_UNAVAILABLE',
        message: 'YouTube is unreachable right now',
      });
    }
    if (!response.ok) {
      // 403 means several things — tell the quota apart from a key that is
      // misconfigured (wrong referrer, API not enabled), which never heals.
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string; errors?: Array<{ reason?: string }> };
      } | null;
      const reason = body?.error?.errors?.[0]?.reason ?? '';
      const quota = /quota|rateLimit/i.test(reason);
      this.logger.warn(
        `YouTube API ${response.status} (${reason}): ${body?.error?.message ?? ''}`,
      );
      throw new ServiceUnavailableException({
        code: quota
          ? 'YOUTUBE_QUOTA'
          : response.status === 403
            ? 'YOUTUBE_KEY_REJECTED'
            : 'YOUTUBE_UNAVAILABLE',
        message: quota
          ? 'YouTube search limit reached for today'
          : 'YouTube is unavailable right now',
      });
    }
    return (await response.json()) as T;
  }

  private async cached<T>(
    path: string,
    ttlSeconds: number,
    load: () => Promise<T>,
  ): Promise<T> {
    const key = `youtube:${createHash('sha1').update(path).digest('hex')}`;
    const client = this.redis.getClient();
    try {
      const hit = await client?.get(key);
      if (hit) return JSON.parse(hit) as T;
    } catch {
      /* fall through to the API */
    }
    const value = await load();
    const empty =
      Array.isArray((value as { items?: unknown[] }).items) &&
      !(value as { items: unknown[] }).items.length;
    try {
      if (!empty)
        await client?.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      /* best-effort */
    }
    return value;
  }
}
