const AUTH_EVENT_KEY = "optima_auth_event";
const ACCESS_TOKEN_KEY = "optima_access_token";
const REFRESH_TOKEN_KEY = "optima_refresh_token";

/**
 * Auth now lives entirely in httpOnly cookies set by the backend — nothing
 * token- or user-related is readable or stored by frontend JS anymore (that's
 * the whole point: an XSS bug can't exfiltrate a cookie it can't read).
 * This module is just a same-tab + cross-tab "something about the session
 * changed, go re-check" signal; callers re-fetch `/users/me` in response
 * rather than trusting any locally cached state.
 */
export const session = {
  accessToken() {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  },
  refreshToken() {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  },
  save(accessToken: string, refreshToken: string) {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  },
  clear() {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
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
