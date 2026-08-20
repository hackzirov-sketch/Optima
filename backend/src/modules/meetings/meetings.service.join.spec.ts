import { ConflictException, ForbiddenException } from '@nestjs/common';
import { MeetingsService } from './meetings.service';
import { MeetingStatus } from '../../common/enums/meeting.enum';
import { MESH_MAX_PARTICIPANTS } from './meetings.constants';

const MEETING = 'meeting-1';
const USER = 'user-1';
const HOST = 'host-1';

/**
 * Rejoining used to be a free pass: join() matched *any* meeting_participants
 * row for the caller, reopened it and returned, so the lock and capacity
 * checks below it never ran for anyone who had been in the call before.
 */
describe('MeetingsService.join — a returning participant is re-vetted', () => {
  let dataSource: { query: jest.Mock };
  let repository: { findMeeting: jest.Mock };
  let accessService: {
    resolveAccess: jest.Mock;
    accessDeniedMessage: jest.Mock;
  };
  let service: MeetingsService;

  const meeting = (overrides: Record<string, unknown> = {}) => ({
    id: MEETING,
    hostId: HOST,
    status: MeetingStatus.LIVE,
    locked: false,
    maxParticipants: MESH_MAX_PARTICIPANTS,
    ...overrides,
  });

  /**
   * join() issues its queries in a fixed order: the caller's open row, then
   * (once past it) the active head count, then the insert.
   */
  const respondWith = ({
    openRow = false,
    activeCount = 0,
  }: { openRow?: boolean; activeCount?: number } = {}) => {
    dataSource.query.mockImplementation((sql: string) => {
      const text = String(sql);
      if (text.includes('SELECT id FROM meeting_participants'))
        return Promise.resolve(openRow ? [{ id: 'mp-1' }] : []);
      if (text.includes('COUNT(*)'))
        return Promise.resolve([{ count: String(activeCount) }]);
      return Promise.resolve([]);
    });
  };

  beforeEach(() => {
    dataSource = { query: jest.fn() };
    repository = { findMeeting: jest.fn() };
    accessService = {
      resolveAccess: jest.fn().mockResolvedValue({ kind: 'auto' }),
      accessDeniedMessage: jest.fn(() => 'denied'),
    };
    service = new MeetingsService(
      dataSource as never,
      repository as never,
      accessService as never,
      {} as never, // recording
      {} as never, // join requests
      {} as never, // files
      {} as never, // members
      {} as never, // reminders
      {} as never, // lifecycle queue
      {} as never, // redis
    );
    // join() ends by re-reading the meeting for the caller; not under test.
    jest.spyOn(service, 'getOne').mockResolvedValue({ id: MEETING } as never);
  });

  it('lets someone already in the call reconnect without re-checking access', async () => {
    repository.findMeeting.mockResolvedValue(meeting({ locked: true }));
    respondWith({ openRow: true });

    await expect(service.join(MEETING, USER)).resolves.toBeDefined();
    // A lock means "no new participants", not "the people inside are evicted".
    expect(accessService.resolveAccess).not.toHaveBeenCalled();
  });

  it('refuses a participant who left once the host has locked the meeting', async () => {
    repository.findMeeting.mockResolvedValue(meeting({ locked: true }));
    respondWith({ openRow: false });
    accessService.resolveAccess.mockResolvedValue({
      kind: 'denied',
      reason: 'locked',
    });

    await expect(service.join(MEETING, USER)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('refuses a participant who left when the mesh is already full', async () => {
    repository.findMeeting.mockResolvedValue(meeting());
    respondWith({ openRow: false, activeCount: MESH_MAX_PARTICIPANTS });

    await expect(service.join(MEETING, USER)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('reopens the old row rather than inserting a duplicate', async () => {
    repository.findMeeting.mockResolvedValue(meeting());
    respondWith({ openRow: false, activeCount: 1 });

    await service.join(MEETING, USER);

    const insert = dataSource.query.mock.calls
      .map(([sql]) => String(sql))
      .find((sql) => sql.includes('INSERT INTO meeting_participants'));
    expect(insert).toContain('ON CONFLICT (meeting_id, user_id)');
    expect(insert).toContain('left_at = NULL');
  });
});
