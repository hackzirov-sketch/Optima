import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ChannelSettingsService } from './channel-settings.service';
import { CommunityService } from './community.service';

const ROOM = 'room-1';
const ACTOR = 'actor-1';
const TARGET = 'target-1';

/**
 * Who may act on whom. The room role model is the only thing standing between
 * an admin and the room's owner, so each of its three rules is checked here:
 * no self-target, nothing at or above your own level, and `owner` is not a
 * role anyone can hand out.
 */
describe('ChannelSettingsService — moderation guards', () => {
  let dataSource: { query: jest.Mock };
  let memberService: {
    assertRoomMember: jest.Mock;
    invalidateRoomMember: jest.Mock;
  };
  let service: ChannelSettingsService;

  const roles: Record<string, string> = {};

  const build = () => {
    dataSource = { query: jest.fn().mockResolvedValue([{ id: 'row-1' }]) };
    memberService = {
      assertRoomMember: jest.fn((_room: string, userId: string) =>
        Promise.resolve({ role: roles[userId] ?? 'member' }),
      ),
      invalidateRoomMember: jest.fn().mockResolvedValue(undefined),
    };
    service = new ChannelSettingsService(
      dataSource as never,
      memberService as never,
      { getJson: jest.fn(), setJson: jest.fn(), drop: jest.fn() } as never,
      { safeDecrypt: jest.fn() } as never,
      { log: jest.fn() } as never,
      { emit: jest.fn() } as never,
    );
  };

  beforeEach(() => {
    roles.actor1 = 'admin';
    roles[ACTOR] = 'admin';
    roles[TARGET] = 'member';
    build();
  });

  it('lets an admin remove an ordinary member', async () => {
    await expect(
      service.removeMember(ROOM, ACTOR, TARGET),
    ).resolves.toMatchObject({ removed: true });
  });

  it('refuses to act on yourself', async () => {
    await expect(
      service.removeMember(ROOM, ACTOR, ACTOR),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to act on an equal', async () => {
    roles[TARGET] = 'admin';
    await expect(service.banMember(ROOM, ACTOR, TARGET)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('refuses to act on the owner', async () => {
    roles[TARGET] = 'owner';
    await expect(
      service.removeMember(ROOM, ACTOR, TARGET),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses moderation from a plain member', async () => {
    roles[ACTOR] = 'member';
    await expect(
      service.removeMember(ROOM, ACTOR, TARGET),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('records a timed ban and keeps the row after removal', async () => {
    const until = new Date(Date.now() + 3600_000);
    await expect(
      service.banMember(ROOM, ACTOR, TARGET, until),
    ).resolves.toMatchObject({ banned: true, until });

    const [sql, params] = dataSource.query.mock.calls.find(([text]) =>
      String(text).includes('UPDATE chat_members'),
    ) as [string, unknown[]];
    // COALESCE, not a plain now(): banning someone who already left must not
    // rewrite when they left, and the row has to survive so the rejoin paths
    // can still see the ban.
    expect(sql).toContain('left_at = COALESCE(left_at, now())');
    expect(params[2]).toBe(until);
  });

  it('will not mint an owner through setMemberRole', async () => {
    await expect(
      service.setMemberRole(ROOM, ACTOR, TARGET, 'owner'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

/**
 * The community endpoint addresses members by username and used to write the
 * role straight through — no vocabulary check, no self-target check, no rank
 * check — so an admin could send `{"role":"owner"}` with their own username.
 */
describe('CommunityService.updateMemberRole — delegates to the role model', () => {
  let dataSource: { query: jest.Mock };
  let channelSettings: { setMemberRole: jest.Mock };
  let service: CommunityService;

  beforeEach(() => {
    dataSource = {
      query: jest.fn((sql: string) =>
        Promise.resolve(
          String(sql).includes('is_system')
            ? [{ isSystem: true }]
            : [{ id: TARGET }],
        ),
      ),
    };
    channelSettings = {
      setMemberRole: jest.fn().mockResolvedValue({ userId: TARGET }),
    };
    service = new CommunityService(
      dataSource as never,
      { assertRoomMember: jest.fn() } as never,
      channelSettings as never,
    );
  });

  it('rejects a role outside the vocabulary', async () => {
    await expect(
      service.updateMemberRole(ROOM, 'someone', 'owner' as never, ACTOR),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(channelSettings.setMemberRole).not.toHaveBeenCalled();
  });

  it('hands a legitimate change to the guarded path', async () => {
    await service.updateMemberRole(ROOM, 'someone', 'admin', ACTOR);

    expect(channelSettings.setMemberRole).toHaveBeenCalledWith(
      ROOM,
      ACTOR,
      TARGET,
      'admin',
    );
  });
});
