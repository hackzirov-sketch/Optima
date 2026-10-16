import { describe, expect, it } from "vitest";
import { normalizeRoomStats } from "./roomStats";

describe("room statistics compatibility", () => {
  it("accepts responses without optional post and growth collections", () => {
    const stats = normalizeRoomStats({ subscribers: 12, views: 8 });
    expect(stats.subscribers).toBe(12);
    expect(stats.topPosts).toEqual([]);
    expect(stats.growth).toEqual([]);
  });
  it("rejects invalid envelopes and ignores malformed collection entries", () => {
    expect(() => normalizeRoomStats([])).toThrow();
    expect(() => normalizeRoomStats(null)).toThrow();
    expect(normalizeRoomStats({ topPosts: [null, {}], growth: [null], views: NaN }).views).toBe(0);
    expect(normalizeRoomStats({ topPosts: [null, {}] }).topPosts).toEqual([]);
  });
});
