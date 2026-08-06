// NotificationsService imports EventsGateway for its forwardRef, which drags
// in socket.io and the ESM-only `cookie` package that ts-jest won't transform.
// The gateway is injected as a stub here anyway, so the real module is never
// needed — this just stops the import chain from being followed.
jest.mock('../gateway/events.gateway', () => ({ EventsGateway: class {} }));

import { NotificationsService } from './notifications.service';

/**
 * The counter is a cache, not a ledger. These pin the two properties that
 * makes safe: it is only ever adjusted while it exists (so it can't be
 * conjured from nothing and drift), and a missing counter is rebuilt from
 * Postgres rather than assumed to be zero.
 */
function fakeRedis() {
  const store = new Map<string, number>();
  return {
    store,
    getUnreadCount: jest.fn((userId: string) =>
      Promise.resolve(store.has(userId) ? store.get(userId)! : null),
    ),
    setUnreadCount: jest.fn((userId: string, count: number) => {
      store.set(userId, Math.max(0, count));
      return Promise.resolve();
    }),
    adjustUnreadCount: jest.fn((userId: string, delta: number) => {
      if (!store.has(userId)) return Promise.resolve(); // absent → no-op
      store.set(userId, Math.max(0, store.get(userId)! + delta));
      return Promise.resolve();
    }),
  };
}

const USER = 'user-1';

describe('NotificationsService — unread counter', () => {
  let dataSource: { query: jest.Mock };
  let redis: ReturnType<typeof fakeRedis>;
  let service: NotificationsService;

  beforeEach(() => {
    dataSource = { query: jest.fn() };
    redis = fakeRedis();
    service = new NotificationsService(
      dataSource as never,
      { sendNotification: jest.fn() } as never,
      { dispatch: jest.fn().mockResolvedValue(undefined) } as never,
      redis as never,
    );
  });

  it('seeds from the database on a cache miss', async () => {
    dataSource.query.mockResolvedValue([{ count: '7' }]);

    expect(await service.unreadCount(USER)).toEqual({ count: 7 });
    expect(await service.unreadCount(USER)).toEqual({ count: 7 });

    // Second read is served from Redis: the COUNT(*) it replaces scans a
    // table that only grows.
    expect(dataSource.query).toHaveBeenCalledTimes(1);
  });

  it('counts a new notification once the counter exists', async () => {
    dataSource.query.mockResolvedValue([{ count: '2' }]);
    await service.unreadCount(USER);

    dataSource.query.mockResolvedValue([{ id: 'n-1', userId: USER }]);
    await service.create({ userId: USER, type: 'mention', title: 'hi' });

    expect(await service.unreadCount(USER)).toEqual({ count: 3 });
  });

  it('ignores adjustments when no counter is cached', async () => {
    dataSource.query.mockResolvedValue([{ id: 'n-1', userId: USER }]);
    await service.create({ userId: USER, type: 'mention', title: 'hi' });

    // Nothing was cached, so nothing was invented; the next read rebuilds the
    // true value from Postgres.
    expect(redis.store.has(USER)).toBe(false);
    dataSource.query.mockResolvedValue([{ count: '11' }]);
    expect(await service.unreadCount(USER)).toEqual({ count: 11 });
  });

  it('decrements only the first time a notification is read', async () => {
    dataSource.query.mockResolvedValue([{ count: '2' }]);
    await service.unreadCount(USER);

    dataSource.query.mockResolvedValue([
      { id: 'n-1', userId: USER, isRead: true, wasRead: false },
    ]);
    await service.markRead(USER, 'n-1');
    expect(await service.unreadCount(USER)).toEqual({ count: 1 });

    dataSource.query.mockResolvedValue([
      { id: 'n-1', userId: USER, isRead: true, wasRead: true },
    ]);
    await service.markRead(USER, 'n-1');

    // Re-reading an already-read notification still succeeds, but must not
    // take the count down twice for one notification.
    expect(await service.unreadCount(USER)).toEqual({ count: 1 });
  });

  it('does not leak wasRead into the response', async () => {
    dataSource.query.mockResolvedValue([
      { id: 'n-1', userId: USER, isRead: true, wasRead: false },
    ]);

    const result = await service.markRead(USER, 'n-1');

    expect(result).not.toHaveProperty('wasRead');
  });

  it('zeroes the counter on mark-all-read', async () => {
    dataSource.query.mockResolvedValue([{ count: '5' }]);
    await service.unreadCount(USER);

    dataSource.query.mockResolvedValue([]);
    await service.markAllRead(USER);

    expect(await service.unreadCount(USER)).toEqual({ count: 0 });
  });

  it('decrements when an unread notification is deleted outright', async () => {
    dataSource.query.mockResolvedValue([{ count: '4' }]);
    await service.unreadCount(USER);

    dataSource.query.mockResolvedValue([{ id: 'n-1', isRead: false }]);
    await service.remove('n-1', USER);

    expect(await service.unreadCount(USER)).toEqual({ count: 3 });
  });

  it('leaves the counter alone when a read notification is deleted', async () => {
    dataSource.query.mockResolvedValue([{ count: '4' }]);
    await service.unreadCount(USER);

    dataSource.query.mockResolvedValue([{ id: 'n-1', isRead: true }]);
    await service.remove('n-1', USER);

    expect(await service.unreadCount(USER)).toEqual({ count: 4 });
  });
});
