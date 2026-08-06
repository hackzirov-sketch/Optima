import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { NotesService } from './notes.service';

const MEETING = 'meeting-1';
const USER = 'user-1';

/**
 * A meeting can belong to a workspace, so the interesting question is which
 * rule wins. Meeting notes are visible to the people who were in the call —
 * not to everyone in the organisation that owns it.
 */
describe('NotesService — meeting scope', () => {
  let dataSource: { query: jest.Mock };
  let members: { assertMember: jest.Mock };
  let service: NotesService;

  /** `inCall` decides what the participation probe answers. */
  const withParticipation = (inCall: boolean, note?: Record<string, unknown>) =>
    dataSource.query.mockImplementation((sql: string) => {
      const text = String(sql);
      if (text.includes('FROM meetings m'))
        return Promise.resolve(inCall ? [{ '?column?': 1 }] : []);
      if (text.includes('INSERT INTO notes'))
        return Promise.resolve([{ id: 'note-1', meetingId: MEETING }]);
      if (text.includes('FROM notes WHERE id'))
        return Promise.resolve(note ? [note] : []);
      return Promise.resolve([]);
    });

  beforeEach(() => {
    dataSource = { query: jest.fn().mockResolvedValue([]) };
    members = { assertMember: jest.fn().mockResolvedValue({}) };
    service = new NotesService(dataSource as never, members as never);
  });

  it('lets someone in the call take a note on it', async () => {
    withParticipation(true);

    const note = await service.create(USER, {
      title: 'Decisions',
      meetingId: MEETING,
    });

    expect(note.id).toBe('note-1');
  });

  it('refuses a note from someone who was never in the call', async () => {
    withParticipation(false);

    await expect(
      service.create(USER, { title: 'x', meetingId: MEETING }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a note that claims two scopes at once', async () => {
    // Which list would it appear in? The scopes are alternatives, not layers.
    await expect(
      service.create(USER, {
        title: 'x',
        meetingId: MEETING,
        projectId: 'project-1',
        workspaceId: 'ws-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lists a meeting’s notes for a participant', async () => {
    withParticipation(true);

    await service.list(USER, { meetingId: MEETING });

    const listed = dataSource.query.mock.calls.some(
      ([sql, params]) =>
        String(sql).includes('meeting_id = $1') &&
        (params as string[])[0] === MEETING,
    );
    expect(listed).toBe(true);
  });

  it('refuses to list them for anyone else', async () => {
    withParticipation(false);

    await expect(
      service.list(USER, { meetingId: MEETING }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not fall through to workspace membership', async () => {
    // The note's meeting belongs to a workspace this user is a member of.
    // Membership of the organisation is not membership of the conversation.
    withParticipation(false, {
      id: 'note-1',
      meetingId: MEETING,
      workspaceId: 'ws-1',
      creatorId: 'someone-else',
    });

    await expect(service.getOne('note-1', USER)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(members.assertMember).not.toHaveBeenCalled();
  });

  it('keeps reading a note after the writer has left the call', async () => {
    // Participation is "was ever in it", not "is in it now" — notes are read
    // after the meeting, which is the whole point of writing them.
    withParticipation(true, {
      id: 'note-1',
      meetingId: MEETING,
      workspaceId: null,
      creatorId: 'someone-else',
    });

    await expect(service.getOne('note-1', USER)).resolves.toMatchObject({
      id: 'note-1',
    });
  });

  it('leaves meeting notes out of the personal global list', async () => {
    await service.list(USER, {});

    const [sql] = dataSource.query.mock.calls[0];
    expect(String(sql)).toContain('meeting_id IS NULL');
  });
});
