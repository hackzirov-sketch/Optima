import { BadRequestException, ConflictException } from '@nestjs/common';
import { ChatE2eeService } from './e2ee.service';
import {
  E2EE_ATTACHMENT_MIME,
  isE2eeRoom,
  normalizeEnvelope,
} from './e2ee.util';

const DEVICE = 'device-abc123';
const envelope = (v: 1 | 2 = 1, epoch = 3) => ({
  v,
  epoch,
  device: DEVICE,
  iv: 'AAAAAAAAAAAAAAAA',
  ct: 'Y2lwaGVydGV4dA==',
});

const dm = { id: 'room-dm', type: 'direct', scope: 'private', e2eeEpoch: 3 };
const pub = { id: 'room-pub', type: 'channel', scope: 'public', e2eeEpoch: 0 };

/**
 * The send-path rules that keep the Telegram-style split honest: E2EE rooms
 * take nothing the server could read, public rooms take nothing their readers
 * couldn't.
 */
describe('ChatE2eeService.assertMessageEncryption', () => {
  let query: jest.Mock;
  let service: ChatE2eeService;

  beforeEach(() => {
    // device lookup → found; needsRotation → no difference
    query = jest.fn((sql: string) =>
      Promise.resolve(sql.includes('AS diff') ? [{ diff: '0' }] : [{ '?': 1 }]),
    );
    service = new ChatE2eeService(
      { query } as never,
      {} as never,
      { emit: jest.fn() } as never,
    );
  });

  it('decides E2EE from type and scope', () => {
    expect(isE2eeRoom({ type: 'direct', scope: 'public' })).toBe(true);
    expect(isE2eeRoom({ type: 'group', scope: 'private' })).toBe(true);
    expect(isE2eeRoom({ type: 'group', scope: 'group_only' })).toBe(true);
    expect(isE2eeRoom({ type: 'group', scope: 'public' })).toBe(false);
    expect(isE2eeRoom({ type: 'channel', scope: 'public' })).toBe(false);
  });

  it('accepts a current-epoch envelope in an E2EE room', async () => {
    await expect(
      service.assertMessageEncryption(dm, 'u1', envelope(), false),
    ).resolves.toMatchObject({ v: 1, epoch: 3 });
  });

  it('refuses plaintext in an E2EE room', async () => {
    await expect(
      service.assertMessageEncryption(dm, 'u1', undefined, true),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a stale epoch', async () => {
    await expect(
      service.assertMessageEncryption(dm, 'u1', envelope(1, 2), false),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('requires a re-key when the member devices changed', async () => {
    query.mockImplementation((sql: string) =>
      Promise.resolve(sql.includes('AS diff') ? [{ diff: '1' }] : [{}]),
    );
    await expect(
      service.assertMessageEncryption(dm, 'u1', envelope(), false),
    ).rejects.toMatchObject({
      response: { code: 'E2EE_REKEY_REQUIRED' },
    });
  });

  it('refuses unencrypted files in an E2EE room', async () => {
    await expect(
      service.assertMessageEncryption(dm, 'u1', envelope(2), false, [
        'image/png',
      ]),
    ).rejects.toMatchObject({ response: { code: 'E2EE_REQUIRED' } });
  });

  it('requires file keys (envelope v2) with encrypted files', async () => {
    await expect(
      service.assertMessageEncryption(dm, 'u1', envelope(1), false, [
        E2EE_ATTACHMENT_MIME,
      ]),
    ).rejects.toMatchObject({ response: { code: 'E2EE_REQUIRED' } });
    await expect(
      service.assertMessageEncryption(dm, 'u1', undefined, false, [
        E2EE_ATTACHMENT_MIME,
      ]),
    ).rejects.toMatchObject({ response: { code: 'E2EE_REQUIRED' } });
    await expect(
      service.assertMessageEncryption(dm, 'u1', envelope(2), false, [
        E2EE_ATTACHMENT_MIME,
      ]),
    ).resolves.toMatchObject({ v: 2 });
  });

  it('keeps public rooms plaintext: no envelopes, no encrypted files', async () => {
    await expect(
      service.assertMessageEncryption(pub, 'u1', undefined, true, [
        'image/png',
      ]),
    ).resolves.toBeNull();
    await expect(
      service.assertMessageEncryption(pub, 'u1', envelope(), false),
    ).rejects.toMatchObject({ response: { code: 'E2EE_NOT_ALLOWED' } });
    await expect(
      service.assertMessageEncryption(pub, 'u1', undefined, false, [
        E2EE_ATTACHMENT_MIME,
      ]),
    ).rejects.toMatchObject({ response: { code: 'E2EE_NOT_ALLOWED' } });
  });
});

describe('normalizeEnvelope', () => {
  it('keeps only the known fields', () => {
    expect(
      normalizeEnvelope({ ...envelope(2), extra: 'x'.repeat(10) }),
    ).toEqual(envelope(2));
  });

  it('rejects malformed payloads', () => {
    for (const bad of [
      null,
      'x',
      { ...envelope(), v: 3 },
      { ...envelope(), epoch: 0 },
      { ...envelope(), device: 'short' },
      { ...envelope(), ct: { nested: true } },
      { ...envelope(), ct: 'not base64!' },
      { ...envelope(), ct: 'A'.repeat(30_000) },
    ])
      expect(normalizeEnvelope(bad)).toBeNull();
  });
});
