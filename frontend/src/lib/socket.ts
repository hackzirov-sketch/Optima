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
      // Auth is the httpOnly access-token cookie — withCredentials makes the
      // browser attach it to the handshake request automatically, same as
      // any other same-site request. Nothing for JS to read or hand over.
      withCredentials: true,
      auth: { token: session.accessToken() },
      transports: ["websocket", "polling"],
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 8,
    });
  } else {
    socket.auth = { token: session.accessToken() };
  }
  if (!socket.connected) socket.connect();
  return socket;
}

export function closeSocket() {
  socket?.disconnect();
  socket = null;
}
