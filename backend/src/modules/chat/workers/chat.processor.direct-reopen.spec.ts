import { ChatProcessor } from './chat.processor';

const ROOM = 'room-1';
const SENDER = 'sender-1';

/**
 * Deleting a DM closes only the caller's own membership, so the room outlives
 * it. A new message has to bring the conversation back for them, or the
 * deletion silently swallows everything the other person writes afterwards.
 */
describe('ChatProcessor — a new message reopens a deleted direct chat', () => {
  let dataSource: { query: jest.Mock };
  let processor: ChatProcessor;

  const run = (sequence?: number) =>
    processor['reopenDirectRoomForRecipients']({
      roomId: ROOM,
      senderId: SENDER,
      sequence,
    });

  beforeEach(() => {
    dataSource = { query: jest.fn().mockResolvedValue([]) };
    processor = new ChatProcessor(dataSource as never, {} as never);
  });

  it('only reopens closed memberships, and never the sender’s own', async () => {
    await run(9);

    const [sql, params] = dataSource.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('left_at IS NOT NULL');
    expect(sql).toContain('cm.user_id <> $2');
    expect(params[1]).toBe(SENDER);
  });

  it('limits itself to direct rooms', async () => {
    await run(9);

    // Leaving a group is a decision; being dragged back by the next poster
    // would undo it.
    const [sql] = dataSource.query.mock.calls[0] as [string];
    expect(sql).toContain("r.type = 'direct'");
  });

  it('returns the room with a single unread rather than a backlog', async () => {
    await run(9);

    const [sql, params] = dataSource.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain(
      'last_read_seq = GREATEST(cm.last_read_seq, $3::int - 1)',
    );
    expect(params[2]).toBe(9);
  });

  it('does nothing when the job carries no sequence', async () => {
    await run(undefined);

    expect(dataSource.query).not.toHaveBeenCalled();
  });
});
