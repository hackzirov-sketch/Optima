import { EventsGateway } from './events.gateway';

/**
 * Meeting sockets join `meeting:<id>`; chat sockets join `room:<id>`. Callers
 * used to reach for broadcastToRoom and pre-format the name as
 * `meeting:<id>`, which that method prefixed again — so every meeting event
 * was emitted into `room:meeting:<id>`, a room nobody is ever in, and reached
 * no one. Nothing failed; the events simply vanished.
 */
describe('EventsGateway — meeting vs room broadcast namespaces', () => {
  const MEETING = 'meeting-1';
  let emit: jest.Mock;
  let to: jest.Mock;
  let gateway: EventsGateway;

  beforeEach(() => {
    emit = jest.fn();
    to = jest.fn(() => ({ emit }));
    gateway = Object.create(EventsGateway.prototype) as EventsGateway;
    (gateway as unknown as { server: unknown }).server = { to };
  });

  it('addresses the room meeting sockets actually joined', () => {
    gateway.broadcastToMeeting(MEETING, 'meeting:ended', { reason: 'empty' });

    expect(to).toHaveBeenCalledWith(`meeting:${MEETING}`);
    expect(emit).toHaveBeenCalledWith('meeting:ended', { reason: 'empty' });
  });

  it('keeps the chat namespace separate', () => {
    gateway.broadcastToRoom('room-1', 'new_message', {});

    expect(to).toHaveBeenCalledWith('room:room-1');
  });

  it('never double-prefixes a meeting id', () => {
    gateway.broadcastToMeeting(MEETING, 'meeting:locked', {});

    expect(to).not.toHaveBeenCalledWith(`room:meeting:${MEETING}`);
  });
});
