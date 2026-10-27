import { api, refreshSession } from "./api";
import { currentSocket, getSocket } from "./socket";
import { session } from "./session";
import { isLocalPreview } from "./localPreview";

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
  if (installed || typeof window === "undefined" || isLocalPreview()) return;
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

  // Back from another app / a locked phone: the socket may have died while
  // the page was frozen — reconnect right away instead of waiting for backoff.
  document.addEventListener("visibilitychange", () => {
    const socket = currentSocket();
    if (document.visibilityState === "visible" && socket && !socket.active && session.isActive()) socket.connect();
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
