import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import ms from 'ms';

export const ACCESS_COOKIE = 'optima_access_token';
export const REFRESH_COOKIE = 'optima_refresh_token';
/**
 * A companion, NON-httpOnly cookie carrying no secret (just `"1"") — its only
 * job is letting frontend JS cheaply tell "a session might exist, worth
 * calling /users/me" apart from "definitely logged out, don't bother" without
 * ever being able to read the real tokens. Without this, every fresh/logged-
 * out visitor's first paint fires /users/me + /auth/session + /workspaces +
 * an /auth/refresh attempt for nothing, since there's no local token check
 * left once the real tokens are httpOnly.
 */
export const SESSION_HINT_COOKIE = 'optima_has_session';

/**
 * httpOnly cookies are the only place access/refresh tokens live — nothing
 * JS-readable holds them anymore, so an XSS bug can't exfiltrate a session.
 * SameSite=Lax + Secure (prod) is the CSRF baseline (same approach GitHub/
 * Gmail use); it isn't a substitute for a double-submit CSRF token under a
 * stricter threat model, but it blocks the common case (cross-site POST/
 * fetch can't attach the cookie at all under Lax).
 */
function cookieOptions(config: ConfigService, maxAgeMs: number) {
  const isProduction = config.get<string>('app.nodeEnv') === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeMs,
  };
}

export function setAuthCookies(
  res: Response,
  config: ConfigService,
  tokens: { accessToken: string; refreshToken: string },
): void {
  const accessExpires = config.get<string>('jwt.accessExpires') || '20m';
  const refreshExpires = config.get<string>('jwt.refreshExpires') || '7d';
  const refreshMaxAge = ms(refreshExpires as any) as unknown as number;
  res.cookie(
    ACCESS_COOKIE,
    tokens.accessToken,
    cookieOptions(config, ms(accessExpires as any) as unknown as number),
  );
  res.cookie(
    REFRESH_COOKIE,
    tokens.refreshToken,
    cookieOptions(config, refreshMaxAge),
  );
  const isProduction = config.get<string>('app.nodeEnv') === 'production';
  res.cookie(SESSION_HINT_COOKIE, '1', {
    httpOnly: false,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: refreshMaxAge,
  });
}

export function clearAuthCookies(res: Response, config: ConfigService): void {
  const isProduction = config.get<string>('app.nodeEnv') === 'production';
  const base = {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax' as const,
    path: '/',
  };
  res.clearCookie(ACCESS_COOKIE, base);
  res.clearCookie(REFRESH_COOKIE, base);
  res.clearCookie(SESSION_HINT_COOKIE, { ...base, httpOnly: false });
}
