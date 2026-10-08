import { describe, expect, it } from "vitest";
import { parseMeetingChat } from "./meetingChat";

describe("meeting chat protocol", () => {
  const payload = (text: unknown) => JSON.stringify({ type: "optima-chat-v1", id: "message-1", senderId: "spoofed", text });
  it("uses the established peer identity instead of untrusted payload identity", () => {
    expect(parseMeetingChat(payload("Hello"), "actual-peer")?.senderId).toBe("actual-peer");
  });
  it("preserves Unicode and line breaks", () => {
    expect(parseMeetingChat(payload("Salom\nПривет 👋"), "peer")?.text).toBe("Salom\nПривет 👋");
  });
  it("rejects empty, oversized and non-text content", () => {
    for (const text of [" ", "a".repeat(2001), 23, null]) expect(parseMeetingChat(payload(text), "peer")).toBeNull();
  });
  it("rejects invalid frames", () => {
    for (const raw of [null, "{", "null", "{}", "a".repeat(10001)]) expect(parseMeetingChat(raw, "peer")).toBeNull();
  });
});
