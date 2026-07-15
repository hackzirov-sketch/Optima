import type { AuthResult, User } from "../types";

const ACCESS_KEY = "optima_access_token";
const REFRESH_KEY = "optima_refresh_token";
const USER_KEY = "optima_user";
const WORKSPACE_KEY = "optima_workspace";

export const session = {
  accessToken: () => localStorage.getItem(ACCESS_KEY),
  refreshToken: () => localStorage.getItem(REFRESH_KEY),
  user: (): User | null => {
    try {
      const value = localStorage.getItem(USER_KEY);
      return value ? (JSON.parse(value) as User) : null;
    } catch {
      return null;
    }
  },
  save(result: AuthResult) {
    localStorage.setItem(ACCESS_KEY, result.accessToken);
    localStorage.setItem(REFRESH_KEY, result.refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(result.user));
    window.dispatchEvent(new Event("optima:session"));
  },
  saveTokens(accessToken: string, refreshToken: string) {
    localStorage.setItem(ACCESS_KEY, accessToken);
    localStorage.setItem(REFRESH_KEY, refreshToken);
    window.dispatchEvent(new Event("optima:session"));
  },
  saveUser(user: User) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    window.dispatchEvent(new Event("optima:session"));
  },
  selectedWorkspace: () => localStorage.getItem(WORKSPACE_KEY),
  selectWorkspace(id: string) {
    localStorage.setItem(WORKSPACE_KEY, id);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(WORKSPACE_KEY);
    window.dispatchEvent(new Event("optima:session"));
  },
};
