import { AsyncLocalStorage } from 'async_hooks';
import type { Request } from 'express';

/**
 * The request being served, reachable from deep inside services without
 * threading it through every call — used where a session is minted, so the
 * client's IP, user agent and device id are recorded on every path (login,
 * OAuth, refresh, switching group) instead of only the ones that remembered.
 */
export const requestContext = new AsyncLocalStorage<Request>();

/** The browser install's own id (X-Device-Id, made once and kept by the app). */
export function currentDeviceId(): string | null {
  const raw = requestContext.getStore()?.headers?.['x-device-id'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && /^[A-Za-z0-9-]{8,64}$/.test(value) ? value : null;
}

export function currentRequestMeta(): { ip?: string; userAgent?: string } {
  const req = requestContext.getStore();
  if (!req) return {};
  return {
    ip: req.ip || undefined,
    userAgent: String(req.headers?.['user-agent'] ?? '').slice(0, 300) || undefined,
  };
}
