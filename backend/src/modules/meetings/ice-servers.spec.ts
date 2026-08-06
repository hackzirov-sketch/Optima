import * as crypto from 'crypto';
import { MeetingsService } from './meetings.service';

/**
 * TURN credentials are handed to a browser, so they end up in devtools, in
 * network logs and in any HAR a user sends to support. Relaying is the
 * expensive thing a TURN server does, so a permanent credential is permanent
 * bandwidth for whoever finds one. These pin the properties that make a leak
 * survivable: it expires, and it names who it was issued to.
 */
interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

describe('MeetingsService.getIceServers', () => {
  // getIceServers reads only process.env and its own logger, so the instance
  // is built off the prototype rather than through the constructor — wiring
  // eleven injected dependencies to test a pure function would test the
  // wiring instead.
  const warn = jest.fn();
  const service = Object.create(MeetingsService.prototype) as MeetingsService;
  (service as unknown as { logger: { warn: jest.Mock } }).logger = { warn };

  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  const turnEntry = (
    servers: IceServer[],
  ): Required<Pick<IceServer, 'username' | 'credential'>> & IceServer => {
    const found = servers.find((s) => s.urls.some((u) => u.startsWith('turn')));
    if (!found) throw new Error('no TURN entry was returned');
    if (!found.username || !found.credential)
      throw new Error('TURN entry carried no credentials');
    return found as Required<Pick<IceServer, 'username' | 'credential'>> &
      IceServer;
  };

  it('always offers STUN, even with no TURN configured', () => {
    delete process.env.TURN_URLS;

    const servers = service.getIceServers('user-1');

    expect(servers).toHaveLength(1);
    expect(servers[0].urls.every((u) => u.startsWith('stun:'))).toBe(true);
  });

  it('mints a credential that carries its own expiry', () => {
    process.env.TURN_URLS = 'turn:turn.example.com:3478';
    process.env.TURN_SECRET = 'shared-with-coturn';

    const before = Math.floor(Date.now() / 1000);
    const turn = turnEntry(service.getIceServers('user-1'));

    const [expiry, user] = turn.username.split(':');
    expect(Number(expiry)).toBeGreaterThan(before);
    // Attributable: abuse traces to an account, not to "someone with the key".
    expect(user).toBe('user-1');
  });

  it('signs the credential the way coturn verifies it', () => {
    process.env.TURN_URLS = 'turn:turn.example.com:3478';
    process.env.TURN_SECRET = 'shared-with-coturn';

    const turn = turnEntry(service.getIceServers('user-1'));

    // use-auth-secret mode: password = base64(HMAC-SHA1(username, secret)).
    // Nothing is stored on either side; the server recomputes this.
    const expected = crypto
      .createHmac('sha1', 'shared-with-coturn')
      .update(turn.username)
      .digest('base64');
    expect(turn.credential).toBe(expected);
  });

  it('honours a configured lifetime', () => {
    process.env.TURN_URLS = 'turn:turn.example.com:3478';
    process.env.TURN_SECRET = 'shared-with-coturn';
    process.env.TURN_TTL_SECONDS = '120';

    const turn = turnEntry(service.getIceServers());

    const ttl = Number(turn.username) - Math.floor(Date.now() / 1000);
    expect(ttl).toBeLessThanOrEqual(120);
    expect(ttl).toBeGreaterThan(110);
  });

  it('gives two callers different credentials', () => {
    process.env.TURN_URLS = 'turn:turn.example.com:3478';
    process.env.TURN_SECRET = 'shared-with-coturn';

    const a = turnEntry(service.getIceServers('user-1'));
    const b = turnEntry(service.getIceServers('user-2'));

    expect(a.credential).not.toBe(b.credential);
  });

  it('falls back to the static pair when no secret is set', () => {
    // An existing deployment keeps working until it configures TURN_SECRET.
    process.env.TURN_URLS = 'turn:turn.example.com:3478';
    delete process.env.TURN_SECRET;
    process.env.TURN_USERNAME = 'upzturn';
    process.env.TURN_CREDENTIAL = 'static-password';

    const turn = turnEntry(service.getIceServers('user-1'));

    expect(turn.username).toBe('upzturn');
    expect(turn.credential).toBe('static-password');
    expect(warn).toHaveBeenCalled();
  });

  it('omits TURN entirely when it is configured with no way to authenticate', () => {
    process.env.TURN_URLS = 'turn:turn.example.com:3478';
    delete process.env.TURN_SECRET;
    delete process.env.TURN_USERNAME;
    delete process.env.TURN_CREDENTIAL;

    expect(() => turnEntry(service.getIceServers('user-1'))).toThrow(
      'no TURN entry was returned',
    );
  });
});
