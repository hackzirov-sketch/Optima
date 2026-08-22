import { MeetingsRepository } from './repositories/meetings.repository';

/**
 * Participants used to come back as bare ids. The client resolved names
 * against the viewer's *group* member list, so a guest, a standalone
 * meeting with no group, or simply someone from another organisation
 * rendered as the generic "Qatnashchi" fallback with a placeholder avatar.
 * Being in the meeting is the relationship that matters here.
 */
describe('MeetingsRepository — participants carry an identity', () => {
  const row = {
    id: 'mp-1',
    meetingId: 'meeting-1',
    userId: 'user-1',
    role: 'participant',
    joinedAt: new Date(),
    leftAt: null,
    isMuted: false,
    cameraEnabled: false,
    screenSharing: false,
    u_firstName: 'Elbek',
    u_lastName: 'Rustamjanov',
    u_username: 'elbek',
    u_avatarUrl: null,
  };

  const build = (rows: unknown[]) =>
    new MeetingsRepository({
      query: jest.fn().mockResolvedValue(rows),
    } as never);

  it('folds the joined profile into a user object', async () => {
    const [participant] = await build([row]).findParticipants('meeting-1');

    expect(participant.user).toEqual({
      id: 'user-1',
      firstName: 'Elbek',
      lastName: 'Rustamjanov',
      username: 'elbek',
      avatarUrl: null,
    });
    // The u_* columns are an implementation detail of the join, not API shape.
    expect(participant).not.toHaveProperty('u_firstName');
  });

  it('survives a deleted account without dropping the participant', async () => {
    const orphan = {
      ...row,
      u_firstName: null,
      u_lastName: null,
      u_username: null,
      u_avatarUrl: null,
    };
    const [participant] = await build([orphan]).findParticipants('meeting-1');

    expect(participant.userId).toBe('user-1');
    expect(participant.user.firstName).toBeNull();
  });

  it('exposes the identity through enrichMeeting', () => {
    const repository = build([]);
    const enriched = repository.enrichMeeting({ id: 'meeting-1' }, [
      { ...row, user: { id: 'user-1', firstName: 'Elbek' } },
    ]);

    expect(enriched.participants[0].user).toMatchObject({ firstName: 'Elbek' });
  });
});
