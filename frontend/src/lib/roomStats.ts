export interface RoomStats {
  subscribers: number;
  messages: number;
  views: number;
  reach: number;
  reactions: number;
  storageBytes: number;
  files: number;
  engagement: number;
  topPosts: Array<{ id: string; content: string | null; viewCount: number; createdAt: string }>;
  growth: Array<{ day: string; joined: number }>;
}

export function normalizeRoomStats(value: unknown): RoomStats {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid room statistics");
  const data = value as Record<string, unknown>;
  const count = (key: string) => typeof data[key] === "number" && Number.isFinite(data[key]) ? data[key] as number : 0;
  return {
    subscribers: count("subscribers"), messages: count("messages"), views: count("views"), reach: count("reach"),
    reactions: count("reactions"), storageBytes: count("storageBytes"), files: count("files"), engagement: count("engagement"),
    topPosts: Array.isArray(data.topPosts) ? data.topPosts.filter((post): post is RoomStats["topPosts"][number] =>
      !!post && typeof post.id === "string" && (post.content === null || typeof post.content === "string") && typeof post.viewCount === "number" && typeof post.createdAt === "string") : [],
    growth: Array.isArray(data.growth) ? data.growth.filter((point): point is RoomStats["growth"][number] =>
      !!point && typeof point.day === "string" && typeof point.joined === "number") : [],
  };
}
