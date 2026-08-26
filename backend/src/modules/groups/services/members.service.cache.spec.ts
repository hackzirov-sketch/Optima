import { ForbiddenException } from '@nestjs/common';
import { MembersService } from './members.service';
import { PermissionService } from '../../../common/services/permission.service';
import { RedisKeys } from '../../../redis/redis.keys';
import { MemberRole } from '../../../common/enums';

/** In-memory stand-in for RedisService's JSON cache. */
function fakeRedis() {
  const store = new Map<string, unknown>();
  return {
    store,
    getJson: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    setJson: jest.fn((key: string, value: unknown) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    drop: jest.fn((...keys: string[]) => {
      keys.forEach((key) => store.delete(key));
      return Promise.resolve();
    }),
  };
}

const WS = 'ws-1';
const USER = 'user-1';
const ADMIN = 'admin-1';

describe('MembersService — membership cache', () => {
  let dataSource: { query: jest.Mock };
  let redis: ReturnType<typeof fakeRedis>;
  let service: MembersService;

  const memberRow = (role = MemberRole.JUNIOR, userId = USER) => ({
    id: 'm-1',
    groupId: WS,
    userId,
    role,
  });

  beforeEach(() => {
    dataSource = { query: jest.fn() };
    redis = fakeRedis();
    service = new MembersService(
      dataSource as never,
      new PermissionService(),
      { log: jest.fn().mockResolvedValue(undefined) } as never,
      redis as never,
    );
  });

  it('hits the database once, then serves from cache', async () => {
    dataSource.query.mockResolvedValue([memberRow()]);

    await service.assertMember(WS, USER);
    await service.assertMember(WS, USER);

    expect(dataSource.query).toHaveBeenCalledTimes(1);
  });

  it('does not cache a non-member', async () => {
    dataSource.query.mockResolvedValue([]);

    await expect(service.assertMember(WS, USER)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(service.assertMember(WS, USER)).rejects.toThrow(
      ForbiddenException,
    );

    // Caching the rejection would leave a just-invited member locked out for
    // the length of the TTL.
    expect(dataSource.query).toHaveBeenCalledTimes(2);
    expect(redis.store.size).toBe(0);
  });

  it('keys the cache per group and per user', async () => {
    dataSource.query.mockResolvedValue([memberRow()]);

    await service.assertMember(WS, USER);
    await service.assertMember('ws-2', USER);
    await service.assertMember(WS, 'user-2');

    expect(dataSource.query).toHaveBeenCalledTimes(3);
  });

  it('stops serving a removed member from cache', async () => {
    dataSource.query.mockResolvedValue([memberRow()]);
    await service.assertMember(WS, USER);
    expect(redis.store.size).toBe(1);

    // Requester is an admin; target is a junior, so the rank check passes.
    dataSource.query
      .mockResolvedValueOnce([{ id: WS, ownerId: 'someone-else' }]) // group
      .mockResolvedValueOnce([memberRow(MemberRole.ADMIN, ADMIN)]) // requester
      .mockResolvedValueOnce([memberRow()]) // target
      .mockResolvedValueOnce([]); // delete
    await service.remove(WS, USER, ADMIN);

    // This is the bug the shared cache exists to prevent: a removed member
    // kept full access until the entry aged out.
    expect(redis.store.get(RedisKeys.groupMember(WS, USER))).toBeUndefined();
  });

  it('stops serving a stale role after a role change', async () => {
    dataSource.query.mockResolvedValue([memberRow()]);
    await service.assertMember(WS, USER);

    dataSource.query
      .mockResolvedValueOnce([{ id: WS, ownerId: 'someone-else' }]) // group
      .mockResolvedValueOnce([memberRow(MemberRole.OWNER, ADMIN)]) // requester
      .mockResolvedValueOnce([memberRow(MemberRole.JUNIOR)]) // target
      .mockResolvedValueOnce([memberRow(MemberRole.LEAD)]); // update
    await service.updateRole(WS, USER, { role: MemberRole.LEAD }, ADMIN);

    expect(redis.store.get(RedisKeys.groupMember(WS, USER))).toBeUndefined();
  });

  it('invalidates several members at once', async () => {
    dataSource.query.mockResolvedValue([memberRow()]);
    await service.assertMember(WS, USER);
    await service.assertMember(WS, 'user-2');
    expect(redis.store.size).toBe(2);

    // Ownership transfer changes two rows; dropping only one is the mistake
    // the variadic signature is meant to make unlikely.
    await service.invalidateMember(WS, USER, 'user-2');

    expect(redis.store.size).toBe(0);
  });
});
