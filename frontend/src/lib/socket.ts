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
  const token = session.accessToken();
  if (!socket) {
    socket = io(socketServerUrl(), {
      auth: { token },
      transports: ["websocket", "polling"],
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 8,
    });
  }
  socket.auth = { token };
  if (!socket.connected) socket.connect();
  return socket;
}

export function closeSocket() {
  socket?.disconnect();
  socket = null;
}
