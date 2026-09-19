import { afterEach, describe, expect, it, vi } from "vitest";
import { emojiImageSources, fallbackEmojiImage, fetchAnimatedEmojiManifest, fetchEmojiManifest, localEmojiAssetUrl } from "./emojiAssets";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("emoji availability", () => {
  it("uses the bundled static pack without depending on the CDN", () => {
    expect(emojiImageSources("p1-0001")[0]).toBe("/telegram-emojis/p1-0001.png");
    expect(emojiImageSources("a001-0001")[1]).toBe("/telegram-emojis/animated/previews/a001-0001.png");
    expect(localEmojiAssetUrl("a001-0001")).toBe("/telegram-emojis/animated/a001-0001.lottie");
  });

  it("retains the same emoji id when falling back, then stops retrying", () => {
    const image = { dataset: {}, src: "", alt: "", title: "", removeAttribute: vi.fn() } as unknown as HTMLImageElement;
    fallbackEmojiImage(image, "p1-0001");
    expect(image.src).toBe(emojiImageSources("p1-0001")[1]);
    fallbackEmojiImage(image, "p1-0001");
    expect(image.removeAttribute).toHaveBeenCalledWith("src");
    expect(image.alt).toBe("[emoji]");
  });

  it("returns the local catalog immediately", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify([{ id: "p1-0001" }])));
    vi.stubGlobal("fetch", fetch);
    expect(await fetchEmojiManifest()).toEqual([{ id: "p1-0001" }]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("falls back on a missing CDN host for animated packs", async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError("DNS failed"))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: "a001-0001" }])));
    vi.stubGlobal("fetch", fetch);
    expect(await fetchAnimatedEmojiManifest()).toEqual([{ id: "a001-0001" }]);
    expect(fetch.mock.calls[1][0]).toBe("/telegram-emojis/animated/manifest.json");
  });

  it("rejects SPA fallback HTML and invalid catalog data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("<!doctype html>"))
      .mockResolvedValueOnce(new Response('{"error":"missing"}')));
    await expect(fetchAnimatedEmojiManifest()).rejects.toThrow("Emoji manifest unavailable");
  });

  it("bounds a stalled request before using the fallback", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new Error("aborted")));
    })).mockResolvedValueOnce(new Response('[{"id":"a001-0001"}]'));
    vi.stubGlobal("fetch", fetch);
    const result = fetchAnimatedEmojiManifest();
    await vi.advanceTimersByTimeAsync(6000);
    expect(await result).toEqual([{ id: "a001-0001" }]);
  });
});
