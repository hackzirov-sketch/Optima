import { ChatProcessor } from './chat.processor';
import { NotificationType } from '../../../common/enums';

const ROOM = 'room-1';
const SENDER = 'sender-1';
const MESSAGE = 'msg-1';

describe('ChatProcessor — mention notifications', () => {
  let dataSource: { query: jest.Mock };
  let notifications: { create: jest.Mock };
  let processor: ChatProcessor;

  /**
   * The processor issues its queries in a fixed order: settings, recipients,
   * room, sender. Naming them here keeps each test to the part it cares about.
   */
  const respondWith = ({
    mentionNotifications = true,
    recipients = [] as Array<{ id: string }>,
    roomName = 'general',
  } = {}) => {
    dataSource.query.mockImplementation((sql: string) => {
      const text = String(sql);
      if (text.includes('channel_settings'))
        return Promise.resolve([{ mentionNotifications }]);
      if (text.includes('FROM chat_members'))
        return Promise.resolve(recipients);
      if (text.includes('FROM chat_rooms'))
        return Promise.resolve([{ name: roomName }]);
      if (text.includes('FROM users'))
        return Promise.resolve([{ firstName: 'Ali', lastName: 'Valiyev' }]);
      return Promise.resolve([]);
    });
  };

  const run = (mentions?: string[]) =>
    processor['handleMessageSideEffects']({
      messageId: MESSAGE,
      roomId: ROOM,
      senderId: SENDER,
      mentions,
    });

  beforeEach(() => {
    dataSource = { query: jest.fn().mockResolvedValue([]) };
    notifications = { create: jest.fn().mockResolvedValue({}) };
    processor = new ChatProcessor(dataSource as never, notifications as never);
  });

  it('notifies a mentioned room member', async () => {
    respondWith({ recipients: [{ id: 'user-2' }] });

    await run(['alice']);

    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-2',
        actorId: SENDER,
        type: NotificationType.MENTION,
        entityType: 'chat_message',
        entityId: MESSAGE,
      }),
    );
  });

  it('does nothing when the message mentions no one', async () => {
    respondWith({ recipients: [{ id: 'user-2' }] });

    await run([]);
    await run(undefined);

    // The common case is a message with no mentions; it must not cost a query.
    expect(dataSource.query).not.toHaveBeenCalled();
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('sends nothing when no handle resolves to a member', async () => {
    // Anyone can type any name. A mention of a stranger must not reach them,
    // or a mention becomes a way to poke arbitrary users — and to probe which
    // usernames exist.
    respondWith({ recipients: [] });

    await run(['nobody']);

    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('respects a room that has mention notifications turned off', async () => {
    respondWith({
      mentionNotifications: false,
      recipients: [{ id: 'user-2' }],
    });

    await run(['alice']);

    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('treats missing settings as on', async () => {
    dataSource.query.mockImplementation((sql: string) => {
      const text = String(sql);
      if (text.includes('channel_settings')) return Promise.resolve([]);
      if (text.includes('FROM chat_members'))
        return Promise.resolve([{ id: 'user-2' }]);
      return Promise.resolve([{ name: 'general', firstName: 'Ali' }]);
    });

    await run(['alice']);

    // The settings row is created lazily, so its absence is the default state.
    expect(notifications.create).toHaveBeenCalledTimes(1);
  });

  it('notifies each of several mentioned members once', async () => {
    respondWith({ recipients: [{ id: 'user-2' }, { id: 'user-3' }] });

    await run(['alice', 'bob']);

    expect(notifications.create).toHaveBeenCalledTimes(2);
  });

  it('keeps the message body out of the notification', async () => {
    respondWith({ recipients: [{ id: 'user-2' }] });

    await run(['alice']);

    // Chat content is encrypted at rest; a notification is fanned out to SMS,
    // Telegram and email, and must not reintroduce a plaintext copy.
    const payload = notifications.create.mock.calls[0][0] as {
      message: string;
      title: string;
    };
    expect(payload.message).toBe('You were mentioned in #general.');
    expect(payload.title).toBe('Ali Valiyev mentioned you');
  });

  it('describes an unnamed room without leaking a null', async () => {
    respondWith({ recipients: [{ id: 'user-2' }], roomName: null });

    await run(['alice']);

    const payload = notifications.create.mock.calls[0][0] as {
      message: string;
    };
    expect(payload.message).toBe('You were mentioned in a chat.');
  });
});
