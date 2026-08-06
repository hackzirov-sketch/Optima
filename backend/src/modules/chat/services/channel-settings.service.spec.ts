import { ForbiddenException, BadRequestException } from '@nestjs/common';
import {
  ChannelSettingsService,
  roleSatisfies,
} from './channel-settings.service';

/**
 * Room permissions used to be a scatter of `['owner','admin'].includes(role)`
 * checks that drifted apart — message.service allowed admins where
 * room-invite.service allowed only the creator, and a magic public_id of
 * 777777 stood in for platform admin. Everything now derives from one ranking,
 * so these tests pin the ranking itself.
 */
/**
 * An in-memory stand-in for RedisService's JSON cache. Real enough that the
 * tests exercise the cache path rather than routing around it — a stub that
 * always missed would let a broken invalidation pass.
 */
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

describe('roleSatisfies', () => {
  it('lets a higher role do everything a lower one can', () => {
    expect(roleSatisfies('owner', 'members')).toBe(true);
    expect(roleSatisfies('owner', 'admins')).toBe(true);
    expect(roleSatisfies('admin', 'moderators')).toBe(true);
    expect(roleSatisfies('moderator', 'members')).toBe(true);
  });

  it('refuses a role below the audience', () => {
    expect(roleSatisfies('member', 'moderators')).toBe(false);
    expect(roleSatisfies('moderator', 'admins')).toBe(false);
    expect(roleSatisfies('admin', 'owner')).toBe(false);
  });

  it('opens `members` to everyone, including plain members', () => {
    expect(roleSatisfies('member', 'members')).toBe(true);
  });

  it('restricts `owner` to the owner alone', () => {
    expect(roleSatisfies('owner', 'owner')).toBe(true);
    expect(roleSatisfies('admin', 'owner')).toBe(false);
  });
});

describe('ChannelSettingsService', () => {
  let dataSource: { query: jest.Mock; withTransaction: jest.Mock };
  let redis: ReturnType<typeof fakeRedis>;
  let memberService: {
    assertRoomMember: jest.Mock;
    invalidateRoomMember: jest.Mock;
  };
  let events: { emit: jest.Mock };
  let audit: { log: jest.Mock; list: jest.Mock };
  let service: ChannelSettingsService;

  const settingsRow = {
    roomId: 'room-1',
    whoCanPost: 'admins',
    slowModeSeconds: 0,
    reactionsEnabled: true,
    badWords: [],
    discoverable: true,
    isVerified: false,
    minReputation: 0,
  };

  const asRole = (role: string) =>
    memberService.assertRoomMember.mockResolvedValue({ role });

  beforeEach(() => {
    dataSource = {
      query: jest.fn().mockResolvedValue([settingsRow]),
      withTransaction: jest.fn(),
    };
    memberService = {
      assertRoomMember: jest.fn(),
      invalidateRoomMember: jest.fn().mockResolvedValue(undefined),
    };
    events = { emit: jest.fn() };
    audit = { log: jest.fn().mockResolvedValue(undefined), list: jest.fn() };
    redis = fakeRedis();
    service = new ChannelSettingsService(
      dataSource as never,
      memberService as never,
      redis as never,
      { safeDecrypt: (_json: unknown, fallback: string) => fallback } as never,
      audit as never,
      events as never,
    );
  });

  it('hides moderation detail from ordinary members', async () => {
    asRole('member');
    const result = await service.getForUser('room-1', 'user-1');

    expect(result.canAdminister).toBe(false);
    // A member may see the rules that apply to them...
    expect(result.settings).toHaveProperty('whoCanPost');
    expect(result.settings).toHaveProperty('slowModeSeconds');
    // ...but not the filter configuration, which is a map of what to evade.
    expect(result.settings).not.toHaveProperty('badWords');
    expect(result.settings).not.toHaveProperty('spamFilter');
    expect(result.settings).not.toHaveProperty('integrations');
  });

  it('gives moderators the full configuration', async () => {
    asRole('moderator');
    const result = await service.getForUser('room-1', 'user-1');
    expect(result.canAdminister).toBe(true);
    expect(result.settings).toBe(settingsRow);
  });

  it('refuses a settings write from a plain member', async () => {
    asRole('member');
    await expect(
      service.update('room-1', 'user-1', { slowModeSeconds: 30 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses an owner-only setting from an admin', async () => {
    asRole('admin');
    await expect(
      service.update('room-1', 'user-1', { isVerified: true }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('writes nothing when the submitted values match what is stored', async () => {
    asRole('admin');
    // The dialog PATCHes its whole form on save; an audit trail that records
    // forty unchanged values per save is one nobody can read.
    const result = await service.update('room-1', 'user-1', {
      whoCanPost: 'admins',
      slowModeSeconds: 0,
    });

    expect(result.changes).toEqual({});
    expect(events.emit).not.toHaveBeenCalled();
    const wrote = dataSource.query.mock.calls.some(([sql]) =>
      String(sql).includes('UPDATE channel_settings'),
    );
    expect(wrote).toBe(false);
  });

  it('records a before/after diff and keeps posting_mode in step', async () => {
    asRole('owner');
    dataSource.query.mockImplementation((sql: string) =>
      String(sql).startsWith('UPDATE channel_settings')
        ? Promise.resolve([{ ...settingsRow, whoCanPost: 'members' }])
        : Promise.resolve([settingsRow]),
    );

    const result = await service.update('room-1', 'user-1', {
      whoCanPost: 'members',
    });

    expect(result.changes).toEqual({
      whoCanPost: { from: 'admins', to: 'members' },
    });
    // chat_rooms.posting_mode drives the send path, so it must follow.
    const syncedPostingMode = dataSource.query.mock.calls.some(
      ([sql, params]) =>
        String(sql).includes('UPDATE chat_rooms SET posting_mode') &&
        (params as unknown[])[1] === 'members',
    );
    expect(syncedPostingMode).toBe(true);
    expect(events.emit).toHaveBeenCalledWith(
      'chat.settings_updated',
      expect.objectContaining({ roomId: 'room-1', changes: ['whoCanPost'] }),
    );
  });

  it('rejects an out-of-range slow mode', async () => {
    asRole('admin');
    await expect(
      service.update('room-1', 'user-1', { slowModeSeconds: 99_999 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('will not let an admin appoint another admin', async () => {
    // Admins minting admins means any one of them can dilute the owner's
    // control, and the owner alone cannot undo it.
    memberService.assertRoomMember.mockImplementation((_room, user) =>
      Promise.resolve({ role: user === 'actor' ? 'admin' : 'member' }),
    );
    await expect(
      service.setMemberRole('room-1', 'actor', 'target', 'admin'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets an admin appoint a moderator', async () => {
    memberService.assertRoomMember.mockImplementation((_room, user) =>
      Promise.resolve({ role: user === 'actor' ? 'admin' : 'member' }),
    );
    const result = await service.setMemberRole(
      'room-1',
      'actor',
      'target',
      'moderator',
    );
    expect(result).toEqual({ userId: 'target', role: 'moderator' });
  });

  it('never lets the owner be demoted through the role endpoint', async () => {
    memberService.assertRoomMember.mockImplementation((_room, user) =>
      Promise.resolve({ role: user === 'actor' ? 'admin' : 'owner' }),
    );
    await expect(
      service.setMemberRole('room-1', 'actor', 'target', 'member'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses ownership transfer from a non-owner', async () => {
    asRole('admin');
    await expect(
      service.transferOwnership('room-1', 'actor', 'target'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  describe('settings cache', () => {
    it('serves a second read without touching the database', async () => {
      await service.getRaw('room-1');
      const afterFirst = dataSource.query.mock.calls.length;

      await service.getRaw('room-1');

      // The send-message path calls this for every single message; a busy
      // room turned that into one SELECT per message on a near-static row.
      expect(dataSource.query.mock.calls.length).toBe(afterFirst);
    });

    it('caches per room, not globally', async () => {
      await service.getRaw('room-1');
      const afterFirst = dataSource.query.mock.calls.length;

      await service.getRaw('room-2');

      expect(dataSource.query.mock.calls.length).toBeGreaterThan(afterFirst);
    });

    it('drops the entry when settings are updated', async () => {
      asRole('admin');
      await service.getRaw('room-1');
      expect(redis.store.size).toBe(1);

      await service.update('room-1', 'user-1', {
        slowModeSeconds: 30,
      });

      // Stale settings here mean the old posting rules keep being enforced
      // after an admin has tightened them.
      expect(redis.store.size).toBe(0);
    });
  });
});

/**
 * The ValidationPipe hands the service a DTO *instance*, not a plain object,
 * and under ES2022 class fields every optional property exists on it as
 * `undefined`. The original `field in patch` check was therefore true for all
 * 47 settings on every request: PATCHing a single toggle failed with
 * "whoCanPost: must be one of owner, admins, moderators, members".
 */
describe('ChannelSettingsService — DTO instances with undefined fields', () => {
  class SettingsDtoLike {
    whoCanPost?: string = undefined;
    whoCanComment?: string = undefined;
    slowModeSeconds?: number = undefined;
    discoverable?: boolean = undefined;
  }

  it('ignores properties that are present but undefined', async () => {
    const dataSource = {
      query: jest
        .fn()
        .mockImplementation((sql: string) =>
          String(sql).startsWith('UPDATE channel_settings')
            ? Promise.resolve([{ roomId: 'room-1', discoverable: false }])
            : Promise.resolve([
                { roomId: 'room-1', whoCanPost: 'admins', discoverable: true },
              ]),
        ),
      withTransaction: jest.fn(),
    };
    const memberService = {
      assertRoomMember: jest.fn().mockResolvedValue({ role: 'admin' }),
      invalidateRoomMember: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ChannelSettingsService(
      dataSource as never,
      memberService as never,
      fakeRedis() as never,
      { safeDecrypt: (_json: unknown, fallback: string) => fallback } as never,
      { log: jest.fn(), list: jest.fn() } as never,
      { emit: jest.fn() } as never,
    );

    const dto = new SettingsDtoLike();
    dto.discoverable = false;
    expect('whoCanPost' in dto).toBe(true); // the trap this guards against

    const result = await service.update('room-1', 'user-1', dto as never);

    expect(Object.keys(result.changes)).toEqual(['discoverable']);
  });
});
