import { ChatProcessor } from './chat.processor';

const ROOM = 'room-1';

/**
 * The metadata job dedupes on jobId = roomId, and BullMQ keeps the *first*
 * job enqueued while one is pending — not the last. So during a burst the
 * room can be told about message #1 after #7 was already recorded. Without a
 * guard that walks message_seq backwards, and unread counts
 * (`messageSeq - lastReadSeq`) are computed straight off that column.
 */
describe('ChatProcessor — room metadata is monotonic', () => {
  let dataSource: { query: jest.Mock };
  let processor: ChatProcessor;

  const run = (sequence: number) =>
    processor['handleUpdateRoomMetadata']({
      roomId: ROOM,
      sequence,
      lastMessageId: `msg-${sequence}`,
      lastMessageAt: new Date().toISOString(),
    });

  beforeEach(() => {
    dataSource = { query: jest.fn().mockResolvedValue([{ id: ROOM }]) };
    processor = new ChatProcessor(dataSource as never, {} as never);
  });

  it('guards the write on the stored sequence being older', async () => {
    await run(7);

    const [sql, params] = dataSource.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('message_seq < $2');
    expect(params[1]).toBe(7);
  });

  it('treats a no-op update as a stale job rather than an error', async () => {
    // UPDATE ... RETURNING matched nothing: a newer sequence is already stored.
    dataSource.query.mockResolvedValue([]);

    await expect(run(1)).resolves.toBeUndefined();
  });
});
