import { randomBytes } from 'crypto';
import type { Request } from 'express';
import { RedisService } from '../../../redis/redis.service';

type StoreCallback = (err: Error | null, handle?: string) => void;
type VerifyCallback = (
  err: Error | null,
  ok?: boolean,
  info?: { message: string },
) => void;

const STATE_TTL_SECONDS = 600;

/**
 * `state` for passport-oauth2 without express-session.
 *
 * passport-oauth2's built-in SessionStore keeps the handle in `req.session`,
 * which this app doesn't have — auth is stateless JWT-in-cookie, and adding
 * express-session purely for the ~30 seconds an OAuth round trip takes would
 * mean a whole extra session store to run and secure. Redis is already a hard
 * dependency and is shared across replicas, so the handle lives there instead:
 * the callback can land on a different instance than the one that started the
 * flow and still verify.
 *
 * Single-use by construction — verify deletes the key, so a replayed callback
 * URL fails the second time.
 */
export class OAuthStateStore {
  /** Fallback for a Redis outage: OAuth login keeps working on a single
   * instance rather than failing closed for everyone. Entries are tiny and
   * expire, so an unreachable Redis can't grow this without bound. */
  private readonly memStore = new Map<string, number>();

  constructor(
    private readonly redisService: RedisService,
    private readonly provider: string,
  ) {}

  private key(handle: string): string {
    return `oauth:state:${this.provider}:${handle}`;
  }

  private sweepMemStore(): void {
    const now = Date.now();
    for (const [key, expiresAt] of this.memStore) {
      if (expiresAt <= now) this.memStore.delete(key);
    }
  }

  store(_req: Request, _meta: unknown, callback: StoreCallback): void {
    const handle = randomBytes(24).toString('hex');
    const client = this.redisService.getClient();

    if (!client) {
      this.sweepMemStore();
      this.memStore.set(
        this.key(handle),
        Date.now() + STATE_TTL_SECONDS * 1000,
      );
      callback(null, handle);
      return;
    }

    client
      .set(this.key(handle), '1', 'EX', STATE_TTL_SECONDS)
      .then(() => callback(null, handle))
      .catch((err: Error) => callback(err));
  }

  verify(
    _req: Request,
    providedState: string,
    _meta: unknown,
    callback: VerifyCallback,
  ): void {
    const invalid = {
      message: 'Unable to verify authorization request state.',
    };
    if (!providedState) {
      callback(null, false, invalid);
      return;
    }

    const key = this.key(providedState);
    const client = this.redisService.getClient();

    if (!client) {
      this.sweepMemStore();
      const expiresAt = this.memStore.get(key);
      this.memStore.delete(key);
      callback(null, Boolean(expiresAt && expiresAt > Date.now()), invalid);
      return;
    }

    // DEL returns how many keys it removed, making consumption atomic: two
    // concurrent callbacks replaying the same state can't both succeed.
    client
      .del(key)
      .then((deleted) => callback(null, deleted === 1, invalid))
      .catch((err: Error) => callback(err));
  }
}
