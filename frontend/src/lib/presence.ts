import { useEffect, useState } from "react";
import { getSocket } from "./socket";
import { api } from "./api";
import type { TranslateFn } from "./i18n/i18n";

/** Mirrors backend/src/modules/chat/services/presence.service.ts's PresenceStatus. */
export type PresenceStatus = "online" | "away" | "busy" | "dnd" | "in_meeting" | "invisible" | "offline";

interface PresenceEntry {
  status: PresenceStatus;
  lastSeenAt: string | null;
}

const store = new Map<string, PresenceEntry>();
const listeners = new Set<() => void>();
const pending = new Set<string>();
let fetchTimer: number | null = null;

function notify() {
  listeners.forEach((fn) => fn());
}

function setEntry(userId: string, entry: PresenceEntry) {
  const current = store.get(userId);
  if (current?.status === entry.status && current?.lastSeenAt === entry.lastSeenAt) return;
  store.set(userId, entry);
  notify();
}

/** Batches ids across the same tick into a single /chat/presence request. */
function queueFetch(userId: string) {
  if (store.has(userId) || pending.has(userId)) return;
  pending.add(userId);
  if (fetchTimer) return;
  fetchTimer = window.setTimeout(() => {
    fetchTimer = null;
    const ids = [...pending];
    pending.clear();
    api.chat.presence(ids)
      .then((result) => {
        for (const id of ids) {
          const entry = result[id];
          if (entry) setEntry(id, { status: entry.status as PresenceStatus, lastSeenAt: entry.lastSeenAt });
        }
      })
      .catch(() => { /* presence is best-effort — leave unresolved ids unset */ });
  }, 30);
}

export function getPresence(userId: string): PresenceEntry | undefined {
  return store.get(userId);
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Live status for one user — fetches an initial snapshot, then stays current via socket events. */
export function usePresence(userId?: string | null): PresenceEntry | undefined {
  const [, bump] = useState(0);
  useEffect(() => {
    if (!userId) return;
    queueFetch(userId);
    return subscribe(() => bump((n) => n + 1));
  }, [userId]);
  return userId ? store.get(userId) : undefined;
}

let initialized = false;
const HEARTBEAT_MS = 25_000;
const IDLE_AWAY_MS = 10 * 60_000; // 10 minutes of no input -> away, matching the spec

/**
 * Registers the socket listeners + heartbeat + idle(away) detection exactly
 * once. Call from a component that's always mounted (ChatPage) so this
 * fires as soon as the socket connects, regardless of which route is active.
 */
export function initPresence() {
  if (initialized) return;
  initialized = true;

  const socket = getSocket();
  let heartbeatInterval: number | null = null;
  let idleTimer: number | null = null;
  let isAway = false;

  const startHeartbeat = () => {
    if (heartbeatInterval) return;
    socket.emit("heartbeat");
    heartbeatInterval = window.setInterval(() => socket.emit("heartbeat"), HEARTBEAT_MS);
  };
  const stopHeartbeat = () => {
    if (heartbeatInterval) window.clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  };

  const goActive = () => {
    if (isAway) {
      isAway = false;
      socket.emit("presence.set_status", { status: "online" });
    }
    if (idleTimer) window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(goAway, IDLE_AWAY_MS);
  };
  function goAway() {
    isAway = true;
    socket.emit("presence.set_status", { status: "away" });
  }

  socket.on("connect", () => { startHeartbeat(); goActive(); });
  socket.on("disconnect", stopHeartbeat);
  if (socket.connected) { startHeartbeat(); goActive(); }

  socket.on("presence_snapshot", (data: { presence: Record<string, PresenceStatus> }) => {
    for (const [userId, status] of Object.entries(data.presence || {})) {
      setEntry(userId, { status, lastSeenAt: status === "offline" ? store.get(userId)?.lastSeenAt ?? null : null });
    }
  });
  socket.on("presence_update", (data: { userId: string; status: PresenceStatus }) => {
    setEntry(data.userId, { status: data.status, lastSeenAt: data.status === "offline" ? new Date().toISOString() : null });
  });

  ["mousemove", "keydown", "mousedown", "touchstart"].forEach((event) =>
    window.addEventListener(event, goActive, { passive: true }),
  );
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") goActive();
  });
}

/** Explicit status change from the user (status picker) — busy/dnd/invisible/online, never offline (that's derived). */
export function setMyPresenceStatus(status: Exclude<PresenceStatus, "offline">) {
  getSocket().emit("presence.set_status", { status });
}

const STATUS_LABEL_KEY: Record<Exclude<PresenceStatus, "offline" | "invisible">, string> = {
  online: "presence.online",
  away: "presence.away",
  busy: "presence.busy",
  dnd: "presence.dnd",
  in_meeting: "presence.inMeeting",
};

/** "Online" / "Busy" / "Ishlab chiqmoqda" / "So'nggi faollik 5 daqiqa oldin" — for a chat header or member row. */
export function formatPresenceLabel(entry: PresenceEntry | undefined, t: TranslateFn): string {
  if (!entry || entry.status === "offline") {
    if (!entry?.lastSeenAt) return t("presence.offline");
    const diffMs = Date.now() - new Date(entry.lastSeenAt).getTime();
    if (diffMs < 60_000) return t("presence.lastSeenJustNow");
    if (diffMs < 3_600_000) return t("presence.lastSeenMinutesAgo", { count: Math.floor(diffMs / 60_000) });
    if (diffMs < 86_400_000) return t("presence.lastSeenHoursAgo", { count: Math.floor(diffMs / 3_600_000) });
    return t("presence.lastSeenDaysAgo", { count: Math.floor(diffMs / 86_400_000) });
  }
  return t(STATUS_LABEL_KEY[entry.status as Exclude<PresenceStatus, "offline" | "invisible">] ?? "presence.online");
}

export function isPresenceActive(entry: PresenceEntry | undefined): boolean {
  return !!entry && entry.status !== "offline";
}
