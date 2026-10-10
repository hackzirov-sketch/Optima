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

  constructor(
    config: ConfigService,
    private readonly redis: RedisService,
  ) {
    this.key = config.get<string>('YOUTUBE_API_KEY')?.trim() || '';
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
    return this.cached(`search?${params}`, 6 * 3600, async () => {
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

  async popular(pageToken?: string) {
    const params = new URLSearchParams({
      part: 'snippet,contentDetails,statistics',
      chart: 'mostPopular',
      regionCode: 'UZ',
      maxResults: '24',
    });
    if (pageToken) params.set('pageToken', pageToken);
    return this.cached(`popular?${params}`, 3600, async () => {
      const result = await this.call<{
        nextPageToken?: string;
        items?: unknown[];
      }>(`videos?${params}`);
      return {
        items: (result.items ?? []).map((item) => this.toVideo(item)),
        nextPageToken: result.nextPageToken ?? null,
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
      };
      contentDetails?: { duration?: string };
      statistics?: { viewCount?: string };
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
      this.logger.warn(
        `YouTube API ${response.status} for ${path.split('?')[0]}`,
      );
      throw new ServiceUnavailableException({
        code: response.status === 403 ? 'YOUTUBE_QUOTA' : 'YOUTUBE_UNAVAILABLE',
        message:
          response.status === 403
            ? 'YouTube search limit reached for today'
            : 'YouTube is unreachable right now',
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
    try {
      await client?.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      /* best-effort */
    }
    return value;
  }
}
