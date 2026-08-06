import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { ErrorCode } from '../enums/error-code.enum';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../utils/auth-cookies.util';

/** Header the frontend attaches to every request it makes. */
export const CSRF_HEADER = 'x-upz-client';

/** Methods that cannot change state, so they need no protection. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Second line of defence against cross-site request forgery.
 *
 * Auth is a cookie, so the browser attaches it to requests this app didn't
 * make. `SameSite=Lax` already stops the common case, but it is one flag
 * carrying the whole weight: it is relaxed for top-level navigations, browsers
 * have shipped (and rolled back) different defaults for it, and a single
 * `sameSite` regression in auth-cookies.util.ts would silently remove the only
 * thing standing between a malicious page and an authenticated POST.
 *
 * This adds an independent check that doesn't depend on cookie policy at all.
 * A cross-site HTML form — the one shape of request that needs no CORS
 * permission — can only set a handful of headers, and a custom one is not
 * among them. Anything that *can* set a custom header (fetch, XHR) is subject
 * to a CORS preflight first, which app.bootstrap.ts answers only for the
 * configured frontend origin. So requiring one custom header is enough to
 * separate "our frontend" from "some other site driving the user's cookies".
 *
 * Deliberately scoped to requests that actually authenticate with a cookie:
 *  - the GitHub webhook is a server-to-server POST with no cookies and its own
 *    HMAC signature, and must not be broken by this;
 *  - login/register from a logged-out browser carry no session to forge.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;

    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) return true;

    const cookies = request.cookies ?? {};
    const carriesSession = !!(
      cookies[ACCESS_COOKIE] || cookies[REFRESH_COOKIE]
    );
    if (!carriesSession) return true;

    if (!request.headers[CSRF_HEADER]) {
      throw new ForbiddenException({
        code: ErrorCode.INSUFFICIENT_PERMISSIONS,
        message:
          'Missing client header — this request did not come from the UPZ app',
      });
    }

    return true;
  }
}
