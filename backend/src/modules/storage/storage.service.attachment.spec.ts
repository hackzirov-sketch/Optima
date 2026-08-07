import { BadRequestException } from '@nestjs/common';
import { StorageService } from './storage.service';

/**
 * The send-message payload carries `storageUrl` as a plain string, so without
 * this check a client can skip the upload entirely and attach any URL it
 * likes — rendered by the chat as a trusted file card, with an attacker-chosen
 * filename and MIME type on it.
 */
describe('StorageService.assertOwnedAttachment', () => {
  const USER = '11111111-1111-1111-1111-111111111111';
  const OTHER = '22222222-2222-2222-2222-222222222222';

  const config = {
    get: (key: string) =>
      ({
        'r2.bucketName': 'upz',
        'r2.publicUrl': 'https://files.honeymedia.uz',
        'r2.accountId': 'acct',
        'r2.accessKeyId': 'key',
        'r2.secretAccessKey': 'secret',
        'cloudinary.cloudName': 'upzcloud',
        'cloudinary.apiKey': 'k',
        'cloudinary.apiSecret': 's',
        'cloudinary.folder': 'upz',
      })[key],
  } as any;

  const service = new StorageService(config);

  const ok = (url: string, key: string, userId = USER) =>
    service.assertOwnedAttachment(url, key, userId);

  it('accepts a real R2 presign result', () => {
    expect(() =>
      ok(
        `https://files.honeymedia.uz/attachments/${USER}/abc-report.pdf`,
        `attachments/${USER}/abc-report.pdf`,
      ),
    ).not.toThrow();
  });

  it('accepts a Cloudinary upload for the configured cloud', () => {
    expect(() =>
      ok(
        `https://res.cloudinary.com/upzcloud/video/upload/v1/upz/audio/${USER}/abc.webm`,
        `upz/audio/${USER}/abc`,
      ),
    ).not.toThrow();
  });

  it('rejects an arbitrary external host', () => {
    expect(() =>
      ok('https://evil.example/setup.exe', `attachments/${USER}/setup.exe`),
    ).toThrow(BadRequestException);
  });

  it('rejects a javascript: URL', () => {
    expect(() => ok('javascript:alert(1)', `attachments/${USER}/x`)).toThrow(
      BadRequestException,
    );
  });

  it('rejects plain http even on an allowed host', () => {
    expect(() =>
      ok(
        `http://files.honeymedia.uz/attachments/${USER}/x`,
        `attachments/${USER}/x`,
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects another tenant on the shared Cloudinary host', () => {
    // res.cloudinary.com serves every account, so the host alone proves
    // nothing — the cloud name is the tenant boundary.
    expect(() =>
      ok(
        `https://res.cloudinary.com/attackercloud/image/upload/v1/upz/attachments/${USER}/x.png`,
        `upz/attachments/${USER}/x`,
      ),
    ).toThrow(BadRequestException);
  });

  it("rejects another user's object", () => {
    expect(() =>
      ok(
        `https://files.honeymedia.uz/attachments/${OTHER}/private.pdf`,
        `attachments/${OTHER}/private.pdf`,
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects a host that merely starts with the allowed one', () => {
    expect(() =>
      ok(
        `https://files.honeymedia.uz.evil.example/attachments/${USER}/x`,
        `attachments/${USER}/x`,
      ),
    ).toThrow(BadRequestException);
  });

  // The key proves ownership, but the URL is what gets stored and rendered —
  // so the two have to describe the same object. Pairing an own-looking key
  // with someone else's URL used to satisfy every check above.
  it("rejects an own key paired with another user's URL", () => {
    expect(() =>
      ok(
        `https://files.honeymedia.uz/attachments/${OTHER}/private.pdf`,
        `attachments/${USER}/private.pdf`,
      ),
    ).toThrow(BadRequestException);
  });

  it('does not let a key match mid-segment', () => {
    // The leading slash matters: `.../not-attachments/<user>/x` ends with the
    // key's characters but is a different object, under someone else's prefix.
    expect(() =>
      ok(
        `https://files.honeymedia.uz/${OTHER}/not-attachments/${USER}/x`,
        `attachments/${USER}/x`,
      ),
    ).toThrow(BadRequestException);
  });
});
