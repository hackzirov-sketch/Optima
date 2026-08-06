import { ForbiddenException } from '@nestjs/common';
import { ChatMemberService } from './member.service';
import { RedisKeys } from '../../../redis/redis.keys';

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

const ROOM = 'room-1';
const USER = 'user-1';

describe('ChatMemberService — room membership cache', () => {
  let dataSource: { query: jest.Mock };
  let redis: ReturnType<typeof fakeRedis>;
  let service: ChatMemberService;

  const activeRow = {
    id: 'cm-1',
    roomId: ROOM,
    userId: USER,
    role: 'member',
    status: 'active',
  };

  beforeEach(() => {
    dataSource = { query: jest.fn() };
    redis = fakeRedis();
    service = new ChatMemberService(dataSource as never, redis as never);
  });

  it('serves a repeat check from cache', async () => {
    dataSource.query.mockResolvedValue([activeRow]);

    await service.assertRoomMember(ROOM, USER);
    await service.assertRoomMember(ROOM, USER);

    expect(dataSource.query).toHaveBeenCalledTimes(1);
  });

  it('caches only the authorization fields', async () => {
    dataSource.query.mockResolvedValue([activeRow]);

    await service.assertRoomMember(ROOM, USER);

    // last_read_seq and is_muted are rewritten constantly; caching them would
    // mean every read receipt evicts an entry whose role never changed.
    expect(
      Object.keys(redis.store.get(RedisKeys.roomMember(ROOM, USER)) as object),
    ).toEqual(['id', 'roomId', 'userId', 'role', 'status']);
  });

  it('does not cache a pending invitee', async () => {
    dataSource.query
      .mockResolvedValueOnce([]) // no active membership
      .mockResolvedValueOnce([{ id: 'cm-2', status: 'pending' }]);

    await expect(service.assertRoomMember(ROOM, USER)).rejects.toMatchObject({
      response: { code: 'CHAT_INVITE_PENDING' },
    });
    expect(redis.store.size).toBe(0);
  });

  it('does not cache a non-member', async () => {
    dataSource.query.mockResolvedValue([]);

    await expect(service.assertRoomMember(ROOM, USER)).rejects.toThrow(
      ForbiddenException,
    );

    expect(redis.store.size).toBe(0);
  });

  it('drops the entry when an invite is accepted', async () => {
    dataSource.query.mockResolvedValue([activeRow]);
    await service.assertRoomMember(ROOM, USER);
    expect(redis.store.size).toBe(1);

    dataSource.query
      .mockResolvedValueOnce([{ id: 'cm-1', status: 'pending' }]) // pending row
      .mockResolvedValueOnce([]) // status update
      .mockResolvedValueOnce([{ createdById: 'owner-1' }]) // room lookup
      .mockResolvedValueOnce([]); // notification insert
    await service.acceptChatInvite(ROOM, USER);

    expect(redis.store.size).toBe(0);
  });

  it('drops the entry when a member declines and leaves', async () => {
    dataSource.query.mockResolvedValue([activeRow]);
    await service.assertRoomMember(ROOM, USER);

    dataSource.query
      .mockResolvedValueOnce([{ id: 'cm-1', status: 'pending' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ createdById: 'owner-1' }])
      .mockResolvedValueOnce([]);
    await service.declineChatInvite(ROOM, USER);

    expect(redis.store.get(RedisKeys.roomMember(ROOM, USER))).toBeUndefined();
  });
});
