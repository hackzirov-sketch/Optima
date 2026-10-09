import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Drives lib/e2ee.ts against an in-memory stand-in for the three backend
 * endpoints, switching the "signed-in user" to play several people on their
 * own devices. The fake server mirrors ChatE2eeService: it stores public keys,
 * wrapped room keys and ciphertext, and decides when a re-key is due.
 */

// ── fake IndexedDB (one object store, get/put) ────────────────
const idbData = new Map<string, unknown>();
function request<T>(run: () => T) {
  const req: { result?: T; error?: unknown; onsuccess?: () => void; onerror?: () => void } = {};
  queueMicrotask(() => { req.result = run(); req.onsuccess?.(); });
  return req;
}
vi.stubGlobal("indexedDB", {
  open: () => {
    const req: Record<string, unknown> & { onsuccess?: () => void } = {};
    queueMicrotask(() => {
      req.result = {
        close() {},
        transaction: () => ({
          objectStore: () => ({
            get: (key: string) => request(() => idbData.get(key)),
            put: (value: unknown, key: string) => request(() => { idbData.set(key, value); return key; }),
          }),
        }),
      };
      req.onsuccess?.();
    });
    return req;
  },
});

// ── fake backend ──────────────────────────────────────────────
type Room = { type: string; scope: string; members: Set<string>; epoch: number };
const server = {
  devices: new Map<string, { userId: string; deviceId: string; publicKey: unknown }>(),
  rooms: new Map<string, Room>(),
  epochs: new Map<string, { creatorUserId: string; creatorDeviceId: string }>(),
  keys: new Map<string, { wrappedKey: string; iv: string; wrappedByUser?: string; wrappedByDevice?: string }>(),
  me: "",
};
const isE2ee = (room: Room) => room.type === "direct" || room.scope !== "public";
const memberDevices = (room: Room) => [...server.devices.values()].filter((d) => room.members.has(d.userId));
function needsRotation(roomId: string, room: Room) {
  if (room.epoch === 0) return true;
  const want = new Set(memberDevices(room).map((d) => `${d.userId}:${d.deviceId}`));
  const got = new Set([...server.keys.keys()].filter((k) => k.startsWith(`${roomId}|${room.epoch}|`)).map((k) => k.split("|")[2]));
  return want.size !== got.size || [...want].some((id) => !got.has(id));
}
class FakeApiError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); }
}

vi.mock("./api", () => ({
  ApiError: FakeApiError,
  apiFetch: async (path: string, options: { method?: string; body?: string } = {}) => {
    const body = options.body ? JSON.parse(options.body) : undefined;
    if (path === "/chat/e2ee/devices") {
      server.devices.set(`${server.me}:${body.deviceId}`, { userId: server.me, deviceId: body.deviceId, publicKey: body.publicKey });
      return {};
    }
    const match = path.match(/^\/chat\/rooms\/([^/]+)\/e2ee(\/epochs|\/keys\/share)?(?:\?deviceId=(.+))?$/);
    if (!match) throw new Error(`unexpected ${path}`);
    const [, roomId, epochs, deviceId] = match;
    const room = server.rooms.get(roomId)!;
    if (!room.members.has(server.me)) throw new FakeApiError("not a member", 403, "NOT_ROOM_MEMBER");
    if (epochs === "/keys/share") {
      for (const k of body.keys) {
        const userHad = [...server.keys.keys()].some((id) => id.startsWith(`${roomId}|${k.epoch}|${k.userId}:`));
        if (userHad) server.keys.set(`${roomId}|${k.epoch}|${k.userId}:${k.deviceId}`, { ...k, wrappedByUser: server.me, wrappedByDevice: body.deviceId });
      }
      return { shared: body.keys.length };
    }
    if (epochs) {
      if (body.epoch !== room.epoch + 1) throw new FakeApiError("stale", 409, "E2EE_STALE_EPOCH");
      server.epochs.set(`${roomId}|${body.epoch}`, { creatorUserId: server.me, creatorDeviceId: body.deviceId });
      for (const k of body.keys) server.keys.set(`${roomId}|${body.epoch}|${k.userId}:${k.deviceId}`, k);
      room.epoch = body.epoch;
      return { roomId, epoch: body.epoch };
    }
    const mine = [...server.keys.entries()]
      .filter(([k]) => k.startsWith(`${roomId}|`) && k.endsWith(`|${server.me}:${decodeURIComponent(deviceId)}`))
      .map(([k, v]) => {
        const epoch = Number(k.split("|")[1]);
        const epochCreator = server.epochs.get(`${roomId}|${epoch}`)!;
        const creator = v.wrappedByUser
          ? { creatorUserId: v.wrappedByUser, creatorDeviceId: v.wrappedByDevice! }
          : epochCreator;
        return {
          epoch, wrappedKey: v.wrappedKey, iv: v.iv, ...creator,
          creatorPublicKey: server.devices.get(`${creator.creatorUserId}:${creator.creatorDeviceId}`)!.publicKey,
        };
      });
    const missing = [];
    for (let epoch = 1; epoch <= room.epoch; epoch++) {
      for (const d of memberDevices(room)) {
        const userHad = [...server.keys.keys()].some((id) => id.startsWith(`${roomId}|${epoch}|${d.userId}:`));
        if (userHad && !server.keys.has(`${roomId}|${epoch}|${d.userId}:${d.deviceId}`)) missing.push({ epoch, ...d });
      }
    }
    const enabled = isE2ee(room);
    return {
      roomId, enabled, epoch: room.epoch,
      needsRotation: enabled && needsRotation(roomId, room),
      devices: enabled ? memberDevices(room) : [],
      keys: mine,
      missing,
    };
  },
}));

const e2ee = await import("./e2ee");

function as(userId: string) {
  server.me = userId;
  e2ee.setE2eeUser(userId);
}

describe("chat end-to-end encryption", () => {
  beforeEach(() => {
    server.rooms.set("dm", { type: "direct", scope: "private", members: new Set(["alice", "bob"]), epoch: 0 });
    server.rooms.set("pub", { type: "channel", scope: "public", members: new Set(["alice", "bob"]), epoch: 0 });
    server.rooms.set("grp", { type: "group", scope: "private", members: new Set(["alice", "bob", "carol"]), epoch: 0 });
  });

  it("encrypts a 1:1 message that only the two members can read", async () => {
    as("bob"); await e2ee.isRoomE2ee("dm"); // bob's device registers
    as("alice");
    const body = await e2ee.prepareOutgoing("dm", "Salom, Bob 👋");
    expect(body.content).toBeUndefined();
    expect(body.e2ee?.epoch).toBe(1);
    expect(atob(body.e2ee!.ct)).not.toContain("Salom");

    as("bob");
    expect(await e2ee.decryptEnvelope("dm", "alice", body.e2ee!)).toBe("Salom, Bob 👋");
    as("alice");
    expect(await e2ee.decryptEnvelope("dm", "alice", body.e2ee!)).toBe("Salom, Bob 👋");
  });

  it("leaves public channels as plaintext for server-side encryption", async () => {
    as("alice");
    expect(await e2ee.prepareOutgoing("pub", "Hammaga salom")).toEqual({ content: "Hammaga salom", attachments: [] });
    expect(server.rooms.get("pub")!.epoch).toBe(0); // no keys generated
  });

  it("rejects a ciphertext re-attributed to another sender", async () => {
    as("bob"); await e2ee.isRoomE2ee("dm");
    as("alice");
    const { e2ee: envelope } = await e2ee.prepareOutgoing("dm", "secret");
    as("bob");
    expect(await e2ee.decryptEnvelope("dm", "bob", envelope!)).toBeNull();
  });

  it("re-keys when a member leaves, so they can't read what follows", async () => {
    for (const u of ["bob", "carol"]) { as(u); await e2ee.isRoomE2ee("grp"); }
    as("alice");
    const before = (await e2ee.prepareOutgoing("grp", "carol hali shu yerda")).e2ee!;
    as("carol");
    expect(await e2ee.decryptEnvelope("grp", "alice", before)).toBe("carol hali shu yerda");

    server.rooms.get("grp")!.members.delete("carol");
    as("alice"); // a fresh session sees the new member set
    const after = (await e2ee.prepareOutgoing("grp", "carol ketdi")).e2ee!;
    expect(after.epoch).toBe(before.epoch + 1);
    expect(server.keys.has(`grp|${after.epoch}|carol:${[...server.devices.values()].find((d) => d.userId === "carol")!.deviceId}`)).toBe(false);
    as("bob");
    expect(await e2ee.decryptEnvelope("grp", "alice", after)).toBe("carol ketdi");
  });

  it("encrypts files on the device and opens them for the recipient", async () => {
    const fetched = new Map<string, Blob>();
    vi.stubGlobal("fetch", async (url: string) => new Response(fetched.get(url)));
    as("bob"); await e2ee.isRoomE2ee("dm");
    as("alice");
    const original = new Blob(["%PDF-1.7 maxfiy hujjat"], { type: "application/pdf" });
    const { blob, secret } = await e2ee.encryptFile(original, "shartnoma.pdf");
    expect(blob.type).toBe(e2ee.E2EE_FILE_MIME);
    expect(await blob.text()).not.toContain("maxfiy");
    fetched.set("https://cdn.example/enc.bin", blob);

    const body = await e2ee.prepareOutgoing("dm", "@bob qara", [{
      storageKey: "k", storageUrl: "https://cdn.example/enc.bin", fileName: "encrypted.bin", fileSize: blob.size, mimeType: e2ee.E2EE_FILE_MIME, secret,
    }]);
    expect(body.e2ee?.v).toBe(2);
    expect(body.mentions).toEqual(["bob"]);
    expect(JSON.stringify(body.attachments)).not.toContain(secret.k); // the key never leaves in clear

    as("bob");
    const opened = await e2ee.decryptMessage({
      roomId: "dm", senderId: "alice", content: null as string | null, e2ee: body.e2ee,
      attachments: [{ id: "a1", fileName: "encrypted.bin", fileSize: blob.size, mimeType: e2ee.E2EE_FILE_MIME, url: "https://cdn.example/enc.bin" }],
    });
    expect(opened.content).toBe("@bob qara");
    const file = opened.attachments![0];
    expect(file.fileName).toBe("shartnoma.pdf");
    expect(file.mimeType).toBe("application/pdf");
    expect(file.url.startsWith("blob:")).toBe(true);
  });

  it("gives a member's new device the history that member already had", async () => {
    as("bob"); await e2ee.isRoomE2ee("dm");
    as("alice");
    const old = (await e2ee.prepareOutgoing("dm", "eski xabar")).e2ee!;

    // Bob signs in on a second browser: a fresh device record for the same user.
    idbData.delete("bob");
    as("bob");
    expect(await e2ee.decryptEnvelope("dm", "alice", old)).toBeNull(); // nothing yet

    as("alice"); // alice's client sees bob's new device missing epoch 1 and re-wraps it
    await e2ee.isRoomE2ee("dm");
    await new Promise((resolve) => setTimeout(resolve, 20));

    as("bob");
    expect(await e2ee.decryptEnvelope("dm", "alice", old)).toBe("eski xabar");
  });

  it("shows every member the same safety code", async () => {
    for (const u of ["alice", "bob", "carol"]) { as(u); await e2ee.isRoomE2ee("grp"); }
    const codes = [];
    for (const u of ["alice", "bob", "carol"]) { as(u); codes.push(await e2ee.roomSafetyCode("grp")); }
    expect(codes[0]).toMatch(/^(\d{5} ){11}\d{5}$/);
    expect(new Set(codes).size).toBe(1);
    as("alice");
    expect(await e2ee.roomSafetyCode("pub")).toBeNull();
  });
});
