import type { ContentType } from './video-classifier';

/**
 * Ranking for the Optima video feed — plain arithmetic, no models.
 *
 *   Score = 0.40·E + 0.20·R + 0.15·Q + 0.15·P + 0.10·F      (each 0..100)
 *
 * E educational value (classifier) · R the viewer's interests · Q content
 * quality · P provenance (trusted source) · F freshness. The weights are a
 * starting point, to be tuned against what people actually watch.
 *
 * On top: Spend Time (how much of this kind of video the viewer really
 * watches scales its score) and a frequency cap (a kind the viewer keeps
 * leaving within 5 minutes shows up at most once per 50 recommendations).
 */

export const WEIGHTS = { E: 0.4, R: 0.2, Q: 0.15, P: 0.15, F: 0.1 } as const;
/** "Left early": under 5 minutes and under 30% of the video. */
export const SHORT_WATCH_SECONDS = 5 * 60;
export const SUPPRESSED_EVERY = 50;

export interface RankedVideo {
  youtubeVideoId: string;
  title: string;
  channelId: string;
  channelTitle: string;
  durationSeconds: number;
  publishedAt: string | Date | null;
  viewCount: number | null;
  likeCount: number | null;
  contentType: ContentType;
  topics: string[];
  educational: number;
  provenance: number;
}

export interface TypeStats { samples: number; avgRatio: number; shortShare: number }

export interface ViewerProfile {
  /** 0..1 — how much of each topic the viewer watches, relative to their top topic. */
  topics: Record<string, number>;
  types: Partial<Record<ContentType, TypeStats>>;
  /** Watch ratio of videos already seen. */
  watched: Record<string, number>;
}

export const EMPTY_PROFILE: ViewerProfile = { topics: {}, types: {}, watched: {} };

const clamp = (value: number) => Math.max(0, Math.min(100, value));

/** Q — engagement (likes per view), reach and a sensible length. */
export function qualityScore(video: Pick<RankedVideo, 'viewCount' | 'likeCount' | 'durationSeconds'>): number {
  const views = Number(video.viewCount) || 0;
  const likes = video.likeCount == null ? null : Number(video.likeCount) || 0;
  const engagement = likes === null || views < 50 ? 50 : clamp((likes / views) * 2500); // 4% likes/view → 100
  const reach = clamp((Math.log10(views + 1) / 6) * 100); // 1M views → 100
  const minutes = (Number(video.durationSeconds) || 0) / 60;
  const length = minutes <= 0 ? 55 : minutes < 4 ? 40 : minutes < 8 ? 70 : minutes <= 90 ? 100 : 75;
  return Math.round(0.45 * engagement + 0.3 * reach + 0.25 * length);
}

const KNOWN_SOURCES = /university|университет|universitet|academy|академ|akademiya|institute|институт|instituti|\bmit\b|harvard|stanford|cs50|freecodecamp|khan academy|ted(x|-ed)?\b|kurzgesagt|veritasium|3blue1brown|crash course|coursera|udemy|edx|google|microsoft|aws|ibm|nasa|bbc|national geographic|dw |wired|maktab|школа|maktabi/i;

/** P — a curated channel, an institution, or an unknown. */
export function provenanceScore(channelTitle: string, trusted: boolean): number {
  if (trusted) return 95;
  return KNOWN_SOURCES.test(channelTitle) ? 80 : 50;
}

const FAST_TOPICS = new Set(['programming', 'ai_data', 'technology', 'system_design']);

/** F — newness matters for fast-moving tech, much less for fundamentals. */
export function freshnessScore(publishedAt: string | Date | null, topics: string[], now = Date.now()): number {
  if (!publishedAt) return 60;
  const ageDays = Math.max(0, (now - new Date(publishedAt).getTime()) / 86_400_000);
  const fast = topics.some((topic) => FAST_TOPICS.has(topic));
  return Math.round(fast ? Math.max(20, 100 * 0.5 ** (ageDays / 365)) : Math.max(50, 100 * 0.5 ** (ageDays / 1825)));
}

/** R — 50 for a viewer we know nothing about; their favourite topics climb to 100. */
export function relevanceScore(topics: string[], profile: ViewerProfile): number {
  if (!Object.keys(profile.topics).length) return 50;
  const best = Math.max(0, ...topics.map((topic) => profile.topics[topic] ?? 0));
  return Math.round(35 + 65 * best);
}

/** Spend Time: how much of this kind of video the viewer actually watches. */
export function spendMultiplier(stats?: TypeStats): number {
  if (!stats || stats.samples < 3) return 1;
  const ratio = stats.avgRatio;
  return ratio < 0.1 ? 0.6 : ratio < 0.3 ? 0.8 : ratio < 0.6 ? 1 : ratio < 0.85 ? 1.1 : 1.2;
}

/** A kind the viewer keeps leaving early (option B): capped to one per 50. */
export function isSuppressed(stats?: TypeStats): boolean {
  return Boolean(stats && stats.samples >= 3 && stats.shortShare >= 0.6);
}

export function scoreVideo(video: RankedVideo, profile: ViewerProfile, now = Date.now()) {
  const E = video.educational;
  const R = relevanceScore(video.topics, profile);
  const Q = qualityScore(video);
  const P = video.provenance;
  const F = freshnessScore(video.publishedAt, video.topics, now);
  const base = WEIGHTS.E * E + WEIGHTS.R * R + WEIGHTS.Q * Q + WEIGHTS.P * P + WEIGHTS.F * F;
  let score = base * spendMultiplier(profile.types[video.contentType]);
  // Already watched through: let something new come first.
  if ((profile.watched[video.youtubeVideoId] ?? 0) >= 0.85) score *= 0.5;
  return { score: Math.round(score * 10) / 10, parts: { E, R, Q, P, F } };
}

/**
 * Orders by score, but never lets one topic or channel take over: a candidate
 * sharing the main topic of either of the last two picks loses 8 points, one
 * from a channel among the last three loses 12.
 */
export function diversify<T extends { item: RankedVideo; score: number }>(scored: T[]): T[] {
  const pool = [...scored].sort((a, b) => b.score - a.score);
  const out: T[] = [];
  while (pool.length) {
    const recentTopics = out.slice(-2).map((entry) => entry.item.topics[0]).filter(Boolean);
    const recentChannels = out.slice(-3).map((entry) => entry.item.channelId);
    let bestIndex = 0;
    let bestValue = -Infinity;
    for (let index = 0; index < Math.min(pool.length, 40); index++) {
      const entry = pool[index];
      const value = entry.score
        - (entry.item.topics[0] && recentTopics.includes(entry.item.topics[0]) ? 8 : 0)
        - (entry.item.channelId && recentChannels.includes(entry.item.channelId) ? 12 : 0);
      if (value > bestValue) { bestValue = value; bestIndex = index; }
    }
    out.push(pool.splice(bestIndex, 1)[0]);
  }
  return out;
}

/**
 * Frequency control. `served` counts the recommendations this viewer has been
 * shown so far; `lastShown[type]` is the count when a suppressed type last
 * appeared. Returns the items to show and the updated counters.
 */
export function capSuppressed<T extends { item: RankedVideo }>(
  ordered: T[],
  suppressed: Set<ContentType>,
  served: number,
  lastShown: Partial<Record<ContentType, number>>,
  limit: number,
): { items: T[]; served: number; lastShown: Partial<Record<ContentType, number>> } {
  const items: T[] = [];
  const shown = { ...lastShown };
  let count = served;
  for (const entry of ordered) {
    if (items.length >= limit) break;
    const type = entry.item.contentType;
    if (suppressed.has(type)) {
      if (shown[type] !== undefined && count - (shown[type] as number) < SUPPRESSED_EVERY) continue;
      shown[type] = count;
    }
    items.push(entry);
    count++;
  }
  return { items, served: count, lastShown: shown };
}
