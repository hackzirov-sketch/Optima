import { ForbiddenException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { CsrfGuard, CSRF_HEADER } from './csrf.guard';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../utils/auth-cookies.util';

function contextFor(request: Record<string, unknown>): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function req(overrides: Record<string, unknown> = {}) {
  return {
    method: 'POST',
    cookies: {},
    headers: {},
    ...overrides,
  };
}

describe('CsrfGuard', () => {
  const guard = new CsrfGuard();

  it('rejects a cookie-authenticated mutation with no client header', () => {
    const context = contextFor(req({ cookies: { [ACCESS_COOKIE]: 'token' } }));

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('allows the same request once the client header is present', () => {
    const context = contextFor(
      req({
        cookies: { [ACCESS_COOKIE]: 'token' },
        headers: { [CSRF_HEADER]: 'web' },
      }),
    );

    expect(guard.canActivate(context)).toBe(true);
  });

  it('covers the refresh cookie too, not just the access cookie', () => {
    // POST /auth/refresh carries only the refresh cookie, and rotating
    // someone's session from another origin is exactly the thing to prevent.
    const context = contextFor(req({ cookies: { [REFRESH_COOKIE]: 'token' } }));

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it.each(['GET', 'HEAD', 'OPTIONS'])(
    'leaves %s alone — it cannot change state',
    (method) => {
      const context = contextFor(
        req({ method, cookies: { [ACCESS_COOKIE]: 'token' } }),
      );

      expect(guard.canActivate(context)).toBe(true);
    },
  );

  it('lets a cookieless POST through', () => {
    // The GitHub webhook is a server-to-server POST with no cookies and its
    // own HMAC signature; breaking it here would be a self-inflicted outage.
    const context = contextFor(req());

    expect(guard.canActivate(context)).toBe(true);
  });

  it('ignores non-http contexts (websocket events)', () => {
    const context = {
      getType: () => 'ws',
    } as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(true);
  });
});
