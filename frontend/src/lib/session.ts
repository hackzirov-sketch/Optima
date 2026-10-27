const AUTH_EVENT_KEY = "optima_auth_event";
const ACTIVE_KEY = "optima_session_active";
/** Pre-cookie-era keys. Only referenced to purge them — see below. */
const LEGACY_TOKEN_KEYS = ["optima_access_token", "optima_refresh_token"];

/**
 * Auth lives entirely in httpOnly cookies set by the backend — the JWT
 * strategies read the token from `req.cookies` and ignore the Authorization
 * header outright, so nothing token-related is readable or stored by frontend
 * JS (that's the whole point: an XSS bug can't exfiltrate a cookie it can't
 * read). This module is just a same-tab + cross-tab "something about the
 * session changed, go re-check" signal plus a flag saying whether a session is
 * believed to exist; callers re-fetch `/users/me` rather than trusting any
 * locally cached state.
 *
 * The flag is deliberately NOT a token. An earlier version stored
 * `result.accessToken` here, but the backend strips tokens out of the response
 * body, so what actually landed in localStorage was the string "undefined" —
 * truthy, and duly sent as `Authorization: Bearer undefined` on every request.
 */
function purgeLegacyTokens() {
  try {
    LEGACY_TOKEN_KEYS.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Storage disabled — nothing to purge.
  }
}

purgeLegacyTokens();

export const session = {
  /** Whether a session is believed to exist. Cookie presence isn't readable
   *  from JS, so this is a hint for skipping the bootstrap fetch — never a
   *  substitute for the server's answer. */
  isActive() {
    if (isDemoMode()) return true;
    return localStorage.getItem(ACTIVE_KEY) === "1";
  },
  /** Call after login/refresh succeeds. Tokens are in cookies already. */
  markActive() {
    try {
      localStorage.setItem(ACTIVE_KEY, "1");
    } catch {
      // Private browsing — the app still works, it just re-bootstraps.
    }
  },
  clear() {
    try {
      localStorage.removeItem(ACTIVE_KEY);
    } catch {
      // Nothing to clear.
    }
    purgeLegacyTokens();
  },
  notify() {
    try {
      localStorage.setItem(AUTH_EVENT_KEY, String(Date.now()));
    } catch {
      // Private browsing / storage disabled — the same-tab dispatch below
      // still fires, only cross-tab sync is lost.
    }
    window.dispatchEvent(new Event("optima:session"));
  },
  onChange(handler: () => void) {
    const onCustom = () => handler();
    const onStorage = (event: StorageEvent) => {
      if (event.key === AUTH_EVENT_KEY) handler();
    };
    window.addEventListener("optima:session", onCustom);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("optima:session", onCustom);
      window.removeEventListener("storage", onStorage);
    };
  },
};
import { isDemoMode } from "./demo";

