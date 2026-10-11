import { api, refreshSession } from "./api";
import { currentSocket, getSocket } from "./socket";
import { session } from "./session";

/**
 * Keeps the realtime socket authenticated without dropping it.
 *
 * The socket authenticates with the cookie it had at handshake, and the server
 * cuts it off when that token expires (~15 min). Two things prevent that:
 *  - after every session refresh, POST /realtime/renew (carrying the new
 *    cookie) switches the open socket onto the new token — no reconnect, so a
 *    meeting or chat doesn't blip;
 *  - if the server does drop the socket (renewal missed, a deploy, a revoked
 *    token), refresh the session and reconnect instead of staying offline.
 */
let installed = false;

export function installSocketAuth() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("optima:session-refreshed", () => {
    const socket = currentSocket();
    if (!socket?.connected || !socket.id) return;
    const id = socket.id;
    void api.realtime.renew(id).then(
      ({ renewed }) => {
        // Not renewed (e.g. the server restarted and lost it): reconnect with the new cookie.
        if (!renewed && currentSocket()?.id === id) { socket.disconnect(); socket.connect(); }
      },
      () => undefined,
    );
  });

  let reconnecting = false;
  window.addEventListener("optima:socket-kicked", () => {
    if (reconnecting || !session.isActive()) return;
    reconnecting = true;
    void refreshSession()
      .then((result) => { if (result.ok || result.networkError) getSocket(); })
      .finally(() => { reconnecting = false; });
  });
}
