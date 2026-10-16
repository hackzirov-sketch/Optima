import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { DEV_PWA_RECOVERY_SCRIPT, LEGACY_PWA_ENTRY_PATH, devPwaRecovery, legacyPwaResponse } from "../../dev/pwa-recovery";

function fixture(script = "http://localhost:5173/dev-sw.js?dev-sw", controlled = true) {
  const worker = { scriptURL: script };
  const unregister = vi.fn(async () => true);
  const reload = vi.fn();
  const storage = new Map<string, string>();
  const cacheDelete = vi.fn(async () => true);
  const caches = { keys: async () => ["workbox-precache-v2-http://localhost:5173/", "workbox-precache-v2-http://localhost:9999/", "user-files"], delete: cacheDelete };
  const context = {
    navigator: { serviceWorker: { controller: controlled ? worker : null, getRegistrations: async () => [{ active: worker, scope: "http://localhost:5173/", unregister }] } },
    location: { href: "http://localhost:5173/g/123456", origin: "http://localhost:5173", reload },
    sessionStorage: { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) },
    window: { caches }, caches, URL, console,
  };
  return { context, unregister, reload, cacheDelete, storage };
}

describe("legacy development PWA recovery", () => {
  it("removes the legacy dev worker and only its own precache", async () => {
    const f = fixture();
    await runInNewContext(DEV_PWA_RECOVERY_SCRIPT, f.context);
    expect(f.unregister).toHaveBeenCalledOnce();
    expect(f.reload).toHaveBeenCalledOnce();
    expect(f.cacheDelete.mock.calls).toEqual([["workbox-precache-v2-http://localhost:5173/"]]);
  });
  it("does not unregister production, other-origin or unrelated workers", async () => {
    for (const url of ["http://localhost:5173/sw.js", "https://other.test/dev-sw.js", "http://localhost:5173/custom-worker.js"]) {
      const f = fixture(url);
      await runInNewContext(DEV_PWA_RECOVERY_SCRIPT, f.context);
      expect(f.unregister).not.toHaveBeenCalled();
      expect(f.cacheDelete).not.toHaveBeenCalled();
      expect(f.reload).not.toHaveBeenCalled();
    }
  });
  it("avoids reload loops and does not reload an uncontrolled page", async () => {
    const f = fixture();
    await runInNewContext(DEV_PWA_RECOVERY_SCRIPT, f.context);
    await runInNewContext(DEV_PWA_RECOVERY_SCRIPT, f.context);
    expect(f.reload).toHaveBeenCalledOnce();
    const clean = fixture(undefined, false);
    await runInNewContext(DEV_PWA_RECOVERY_SCRIPT, clean.context);
    expect(clean.reload).not.toHaveBeenCalled();
  });
  it("does nothing when service workers are unavailable", async () => {
    await expect(runInNewContext(DEV_PWA_RECOVERY_SCRIPT, { navigator: {}, console })).resolves.toBeUndefined();
  });
  it("serves JavaScript for old module URLs, leaves other requests alone and is dev-only", () => {
    expect(legacyPwaResponse(LEGACY_PWA_ENTRY_PATH)).toContain("export default recoverLegacyDevPwa");
    expect(legacyPwaResponse("/dev-sw.js")).toContain("self.registration.unregister()");
    expect(legacyPwaResponse("/api/v1/users/me")).toBeUndefined();
    expect(legacyPwaResponse("/sw.js")).toBeUndefined();
    expect(devPwaRecovery().apply).toBe("serve");
  });
});
