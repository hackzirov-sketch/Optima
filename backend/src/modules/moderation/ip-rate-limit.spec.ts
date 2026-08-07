import { HttpException } from '@nestjs/common';
import { IpRateLimitGuard } from './guards/ip-rate-limit.guard';

/**
 * The join-by-code guard ran on 3 attempts per 24 hours and blocked for the
 * rest of the window. Opening a third meeting from one IP — one office, one
 * NAT, one laptop in development — locked that address out for a day, and the
 * refusal was reported in hours. It denied service to real use far more
 * effectively than it denied anything to a code guesser.
 */
describe('IpRateLimitGuard', () => {
  const config = {
    get: (key: string) =>
      ({
        'moderation.ipMaxAttempts': 40,
        'moderation.ipWindowSeconds': 60,
        'moderation.ipMaxBlockSeconds': 90,
      })[key],
  };

  let rows: any[];
  let updates: any[][];

  const guard = () => {
    updates = [];
    const query = jest.fn((sql: string, params: unknown[]) => {
      if (String(sql).startsWith('SELECT')) return Promise.resolve(rows);
      updates.push(params);
      return Promise.resolve([]);
    });
    return new IpRateLimitGuard(
      { withTransaction: (fn: any) => fn(query) } as never,
      config as never,
    );
  };

  const context = {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: {},
        socket: { remoteAddress: '10.0.0.1' },
        route: { path: '/meetings/resolve-by-code' },
        path: '/meetings/resolve-by-code',
      }),
    }),
  } as never;

  const attempt = () => guard().canActivate(context);

  beforeEach(() => {
    rows = [];
  });

  it('lets ordinary traffic through', async () => {
    rows = [
      {
        id: 'r1',
        count: 5,
        windowStart: new Date(),
        blockedUntil: null,
      },
    ];
    await expect(attempt()).resolves.toBe(true);
  });

  it('never blocks for longer than the ceiling', async () => {
    rows = [
      {
        id: 'r1',
        count: 39,
        windowStart: new Date(),
        blockedUntil: null,
      },
    ];

    await expect(attempt()).rejects.toThrow(HttpException);
    const [, , , blockedUntil] = updates[0];
    const seconds = Math.round(
      ((blockedUntil as Date).getTime() - Date.now()) / 1000,
    );
    expect(seconds).toBeLessThanOrEqual(90);
  });

  it('reports the wait in seconds, not hours', async () => {
    rows = [
      {
        id: 'r1',
        count: 1,
        windowStart: new Date(),
        blockedUntil: new Date(Date.now() + 30_000),
      },
    ];

    await expect(attempt()).rejects.toMatchObject({
      response: { message: expect.stringMatching(/Try again in \d+s\./) },
    });
  });

  it('shortens a block left over from the old 24-hour policy', async () => {
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
    rows = [
      { id: 'r1', count: 3, windowStart: new Date(), blockedUntil: tomorrow },
    ];

    await expect(attempt()).rejects.toMatchObject({
      response: { retryAfter: 90 },
    });
    // Rewritten in place, so the next request sees a sane deadline too.
    const [, clamped] = updates[0];
    expect((clamped as Date).getTime()).toBeLessThan(tomorrow.getTime());
  });
});
