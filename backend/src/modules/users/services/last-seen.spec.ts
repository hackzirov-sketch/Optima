import { UsersService } from './users.service';
import { RedisKeys } from '../../../redis/redis.keys';

/**
 * updateLastSeen is called from every socket heartbeat, so it is the highest
 * frequency write in the app. These pin the two things that make batching it
 * safe: nothing reaches Postgres on the hot path, and the drain is what
 * decides the batch (so an overlapping flush can't replay one).
 */
function fakeRedis(available = true) {
  const hashes = new Map<string, Map<string, string>>();
  return {
    hashes,
    getClient: () =>
      available
        ? {
            hset: jest.fn((key: string, field: string, value: unknown) => {
              const hash = hashes.get(key) ?? new Map<string, string>();
              hash.set(field, String(value));
              hashes.set(key, hash);
              return Promise.resolve(1);
            }),
          }
        : null,
    drainHash: jest.fn((key: string) => {
      const hash = hashes.get(key);
      hashes.delete(key);
      return Promise.resolve(Object.fromEntries(hash ?? []));
    }),
    clearCachedUser: jest.fn().mockResolvedValue(undefined),
  };
}

function makeService(redis: ReturnType<typeof fakeRedis>) {
  const dataSource = { query: jest.fn().mockResolvedValue([]) };
  const service = new UsersService(
    dataSource as never,
    { get: () => undefined } as never,
    redis as never,
    { filterText: jest.fn() } as never,
    { filterImageUrl: jest.fn() } as never,
  );
  return { service, dataSource };
}

describe('UsersService — last_seen batching', () => {
  it('does not touch Postgres on the hot path', async () => {
    const redis = fakeRedis();
    const { service, dataSource } = makeService(redis);

    await service.updateLastSeen('user-1');
    await service.updateLastSeen('user-2');
    await service.updateLastSeen('user-1');

    expect(dataSource.query).not.toHaveBeenCalled();
    expect(redis.hashes.get(RedisKeys.lastSeenPending)?.size).toBe(2);
  });

  it('writes the whole batch in a single statement', async () => {
    const redis = fakeRedis();
    const { service, dataSource } = makeService(redis);
    await service.updateLastSeen('user-1');
    await service.updateLastSeen('user-2');

    const flushed = await service.flushLastSeen();

    expect(flushed).toBe(2);
    expect(dataSource.query).toHaveBeenCalledTimes(1);
    const [, params] = dataSource.query.mock.calls[0];
    expect(params[0]).toEqual(['user-1', 'user-2']);
    expect(params[1]).toHaveLength(2);
  });

  it('does nothing when there is nothing staged', async () => {
    const redis = fakeRedis();
    const { service, dataSource } = makeService(redis);

    expect(await service.flushLastSeen()).toBe(0);
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('empties the staging hash so a second flush is a no-op', async () => {
    const redis = fakeRedis();
    const { service, dataSource } = makeService(redis);
    await service.updateLastSeen('user-1');

    await service.flushLastSeen();
    await service.flushLastSeen();

    // The drain is what claims the batch; replaying it would mean several
    // instances writing the same rows.
    expect(dataSource.query).toHaveBeenCalledTimes(1);
  });

  it('falls back to a direct write when Redis is unavailable', async () => {
    const redis = fakeRedis(false);
    const { service, dataSource } = makeService(redis);

    await service.updateLastSeen('user-1');

    // Degrading to the old behaviour beats losing the column entirely.
    expect(dataSource.query).toHaveBeenCalledTimes(1);
    expect(String(dataSource.query.mock.calls[0][0])).toContain(
      'UPDATE users SET last_seen',
    );
  });
});
