import {
  capSuppressed, diversify, EMPTY_PROFILE, freshnessScore, isSuppressed, qualityScore, RankedVideo, relevanceScore, scoreVideo, spendMultiplier, WEIGHTS,
} from './video-ranking';

const video = (over: Partial<RankedVideo> = {}): RankedVideo => ({
  youtubeVideoId: over.youtubeVideoId ?? Math.random().toString(36).slice(2, 13),
  title: 'x', channelId: 'c1', channelTitle: 'Channel', durationSeconds: 1200, publishedAt: new Date().toISOString(),
  viewCount: 100_000, likeCount: 4000, contentType: 'tutorial', topics: ['programming'], educational: 80, provenance: 50, ...over,
});

describe('video ranking', () => {
  it('uses Score = 0.40E + 0.20R + 0.15Q + 0.15P + 0.10F', () => {
    expect(WEIGHTS.E + WEIGHTS.R + WEIGHTS.Q + WEIGHTS.P + WEIGHTS.F).toBeCloseTo(1);
    const v = video();
    const { score, parts } = scoreVideo(v, EMPTY_PROFILE);
    expect(score).toBeCloseTo(0.4 * parts.E + 0.2 * parts.R + 0.15 * parts.Q + 0.15 * parts.P + 0.1 * parts.F, 0);
  });

  it('Q rewards engagement and a sensible length', () => {
    expect(qualityScore({ viewCount: 100_000, likeCount: 4000, durationSeconds: 1200 })).toBeGreaterThan(qualityScore({ viewCount: 100_000, likeCount: 100, durationSeconds: 1200 }));
    expect(qualityScore({ viewCount: 1000, likeCount: 40, durationSeconds: 1200 })).toBeGreaterThan(qualityScore({ viewCount: 1000, likeCount: 40, durationSeconds: 120 }));
  });

  it('F decays fast for tech, slowly for fundamentals', () => {
    const twoYears = new Date(Date.now() - 730 * 86_400_000).toISOString();
    expect(freshnessScore(twoYears, ['programming'])).toBeLessThan(freshnessScore(twoYears, ['history']));
  });

  it('R follows the viewer’s topics', () => {
    const profile = { ...EMPTY_PROFILE, topics: { system_design: 1, history: 0.1 } };
    expect(relevanceScore(['system_design'], profile)).toBe(100);
    expect(relevanceScore(['history'], profile)).toBeLessThan(50);
    expect(relevanceScore(['x'], EMPTY_PROFILE)).toBe(50);
  });

  it('Spend Time scales by how much of a kind the viewer really watches', () => {
    expect(spendMultiplier({ samples: 5, avgRatio: 0.05, shortShare: 1 })).toBe(0.6);
    expect(spendMultiplier({ samples: 5, avgRatio: 0.9, shortShare: 0 })).toBe(1.2);
    expect(spendMultiplier({ samples: 2, avgRatio: 0.05, shortShare: 1 })).toBe(1); // not enough evidence yet
  });

  it('a kind left within 5 minutes again and again is shown once per 50', () => {
    const stats = { samples: 4, avgRatio: 0.1, shortShare: 0.75 };
    expect(isSuppressed(stats)).toBe(true);
    const ordered = Array.from({ length: 120 }, (_, i) => ({ item: video({ contentType: i % 2 ? 'podcast' : 'tutorial' }), score: 1 }));
    let served = 0; let lastShown = {}; let podcasts = 0;
    for (let page = 0; page < 5; page++) {
      const result = capSuppressed(ordered, new Set(['podcast']), served, lastShown, 20);
      podcasts += result.items.filter((entry) => entry.item.contentType === 'podcast').length;
      served = result.served; lastShown = result.lastShown;
    }
    expect(served).toBe(100);
    expect(podcasts).toBe(2); // 100 recommendations → at most 2 podcasts
  });

  it('diversify keeps one channel/topic from taking over', () => {
    const same = Array.from({ length: 4 }, () => ({ item: video({ channelId: 'a', topics: ['programming'] }), score: 90 }));
    const other = { item: video({ channelId: 'b', topics: ['history'] }), score: 80 };
    const order = diversify([...same, other]);
    expect(order.findIndex((entry) => entry.item.channelId === 'b')).toBeLessThan(3);
  });

  it('pushes down what the viewer already watched through', () => {
    const v = video({ youtubeVideoId: 'seen' });
    const fresh = scoreVideo(v, EMPTY_PROFILE).score;
    const seen = scoreVideo(v, { ...EMPTY_PROFILE, watched: { seen: 0.95 } }).score;
    expect(seen).toBeLessThan(fresh);
  });
});
