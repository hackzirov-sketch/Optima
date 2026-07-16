import { io, type Socket } from "socket.io-client";
import { session } from "./session";

let socket: Socket | null = null;

function socketServerUrl(): string {
  if (import.meta.env.VITE_SERVER_URL) return import.meta.env.VITE_SERVER_URL;
  const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (apiUrl && /^https?:\/\//i.test(apiUrl)) {
    return apiUrl.replace(/\/api\/v1\/?$/i, "");
  }
  return window.location.origin;
}

export function getSocket(): Socket {
  if (!socket) {
    socket = io(socketServerUrl(), {
      // A function (not a plain object) so socket.io-client re-reads the
      // current access token on every connection attempt, including its
      // own automatic reconnects after the tab was idle/backgrounded and
      // the token has since expired — a static object would keep resending
      // whatever token was valid when getSocket() was first called.
      auth: (cb) => cb({ token: session.accessToken() }),
      transports: ["websocket", "polling"],
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 8,
    });
  }
  if (!socket.connected) socket.connect();
  return socket;
}

export function closeSocket() {
  socket?.disconnect();
  socket = null;
}
