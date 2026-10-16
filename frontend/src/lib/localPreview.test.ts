import { describe, expect, it } from "vitest";
import { isLocalPreviewEnvironment } from "./localPreview";
import { localPreviewRequest } from "./localPreviewData";

describe("local preview isolation", () => {
  it("returns AI lists, reply history and library collections in their API shapes", async () => {
    expect(Array.isArray(await localPreviewRequest("/chat/ai/conversations"))).toBe(true);
    const reply = await localPreviewRequest<{ conversationId: string; sources: unknown[] }>("/chat/ai", { method: "POST", body: JSON.stringify({ message: "Salom" }) });
    expect(reply.sources).toEqual([]);
    const history = await localPreviewRequest<{ messages: unknown[] }>(`/chat/ai/conversations/${reply.conversationId}`);
    expect(history.messages).toHaveLength(2);
    const books = await localPreviewRequest<{ items: unknown[] }>("/library/search?lang=uz");
    expect(Array.isArray(books.items)).toBe(true);
    expect(Array.isArray(await localPreviewRequest("/library/me/reading"))).toBe(true);
  });
  it("requires development, loopback and an enabled setting", () => {
    expect(isLocalPreviewEnvironment(true, "127.0.0.1", true)).toBe(true);
    expect(isLocalPreviewEnvironment(true, "127.0.0.1")).toBe(false);
    expect(isLocalPreviewEnvironment(false, "127.0.0.1", true)).toBe(false);
    expect(isLocalPreviewEnvironment(true, "optima.honeymedia.uz", true)).toBe(false);
    expect(isLocalPreviewEnvironment(true, "localhost", false)).toBe(false);
  });
  it("returns a test account and saves messages without network access", async () => {
    const user = await localPreviewRequest<{ id: string }>("/users/me");
    expect(user.id).toBe("local-user");
    const saved = await localPreviewRequest<{ content: string }>("/chat/rooms/local-room/messages", { method: "POST", body: JSON.stringify({ content: "Test emoji" }) });
    expect(saved.content).toBe("Test emoji");
    const history = await localPreviewRequest<{ data: { content: string }[] }>("/chat/rooms/local-room/messages");
    expect(history.data.some(m => m.content === "Test emoji")).toBe(true);
  });
  it("does not expose real upload or meeting credentials", async () => {
    await expect(localPreviewRequest("/chat/uploads/presign", { method: "POST" })).rejects.toThrow();
    await expect(localPreviewRequest("/meetings/local/join", { method: "POST" })).rejects.toThrow();
  });
  it("keeps local profile preferences and returns the room settings envelope", async () => {
    await localPreviewRequest("/users/me/account-visibility", { method: "PATCH", body: JSON.stringify({ visibility: "private" }) });
    const user = await localPreviewRequest<{ accountVisibility: string }>("/users/me");
    expect(user.accountVisibility).toBe("private");
    const settings = await localPreviewRequest<{ role: string; canAdminister: boolean; settings: object }>("/chat/rooms/local-room/settings");
    expect(settings.role).toBe("owner");
    expect(settings.canAdminister).toBe(true);
    expect(settings.settings).toBeDefined();
  });
  it("opens the selected group and resolves a personal chat separately", async () => {
    const group = await localPreviewRequest<{ roomId: string }>("/groups/local-workspace/chat/resolve/group/234567");
    expect(group.roomId).toBe("local-general");
    const direct = await localPreviewRequest<{ roomId: string; type: string }>("/groups/local-workspace/chat/resolve/direct/ali");
    expect(direct.type).toBe("direct");
    expect(direct.roomId).not.toBe("local-room");
  });
});
