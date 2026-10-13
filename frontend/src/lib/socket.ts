import { io, type Socket } from "socket.io-client";
import { envUrl } from "./env-url";
import { isLocalPreview } from "./localPreview";

let socket: Socket | null = null;

// Only the origin: socket.io reads a URL's path as the namespace, so
// "https://api.example.com/api/v1" would connect to namespace "/api/v1",
// which the server refuses ("Invalid namespace") — realtime silently dead.
function socketServerUrl(): string {
  for (const candidate of [envUrl(import.meta.env.VITE_SERVER_URL), envUrl(import.meta.env.VITE_API_URL)]) {
    if (!candidate || !/^https?:\/\//i.test(candidate)) continue;
    try { return new URL(candidate).origin; } catch { /* malformed — try the next one */ }
  }
  return window.location.origin;
}

export function getSocket(): Socket {
  if (!socket) {
    socket = io(socketServerUrl(), {
      // Auth is the httpOnly access-token cookie — withCredentials makes the
      // browser attach it to the handshake request automatically, same as
      // any other same-site request. Nothing for JS to read or hand over.
      withCredentials: true,
      transports: ["websocket", "polling"],
      // If the WebSocket upgrade is refused (a proxy that drops the Upgrade
      // header answers 400), fall back to long-polling instead of retrying the
      // same failing WebSocket forever — chat and calls keep working.
      tryAllTransports: true,
      autoConnect: false,
      reconnection: true,
      // Never give up: a capped number of attempts (it was 8, ~40s) left chat
      // and calls silently dead after a laptop sleep or a longer outage until
      // the page was reloaded. Backoff stays at socket.io's 5s ceiling.
      reconnectionAttempts: Infinity,
    });
  }
  if (!socket.connected && !(import.meta.env.DEV && isLocalPreview())) socket.connect();
  return socket;
}

export function closeSocket() {
  socket?.disconnect();
  socket = null;
}

/**
 * Emits and waits for the server's ack. The gateway answers `{ ok: false,
 * error }` when it rejects a payload; that becomes a rejected promise carrying
 * the server's error `code`, so callers can tell a refusal from a timeout
 * (which rejects with socket.io's own error and no code).
 */
export function emitWithAck<T = unknown>(event: string, payload: unknown, timeoutMs = 9000): Promise<T> {
  const target = getSocket();
  return new Promise<T>((resolve, reject) => {
    target.timeout(timeoutMs).emit(event, payload, (error: Error | null, response?: { ok?: boolean; error?: { code?: string; message?: string; retryAfterSeconds?: number } }) => {
      if (error) return reject(error);
      if (response && response.ok === false) {
        return reject(Object.assign(new Error(response.error?.message || "Request failed"), { code: response.error?.code, retryAfterSeconds: response.error?.retryAfterSeconds }));
      }
      resolve(response as T);
    });
  });
}

/** True for a refusal the server sent back, as opposed to a timeout / lost connection. */
export function isServerRejection(error: unknown): boolean {
  return !!error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string";
}
