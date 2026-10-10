import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * The global rate limit, counted per signed-in user rather than per IP.
 *
 * Keyed by IP, everyone behind one address shared a single 20 req/s budget —
 * an office or campus NAT, and worse, every user at once when the API sits
 * behind a proxy that Express doesn't trust (all requests then come from the
 * proxy's address). A handful of people opening the app together was enough
 * to get the whole site 429s. Anonymous requests still fall back to the
 * client IP (see `trust proxy` in main.ts).
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const userId: unknown = req.user?.id;
    if (typeof userId === 'string' && userId) return `user:${userId}`;
    const cfIp = req.headers?.['cf-connecting-ip'];
    if (typeof cfIp === 'string' && cfIp && req.ip && isTrustedHop(req)) {
      return `ip:${cfIp}`;
    }
    return `ip:${req.ip}`;
  }
}

/** Only honour Cloudflare's header when Express already trusts the proxy chain. */
function isTrustedHop(req: Record<string, any>): boolean {
  return Array.isArray(req.ips) && req.ips.length > 0;
}
