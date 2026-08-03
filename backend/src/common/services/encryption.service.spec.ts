import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from './encryption.service';

const SECRET = 'test-encryption-key-at-least-32-chars-long';

function makeService(): EncryptionService {
  const config = {
    get: (key: string) => (key === 'github.encryptionKey' ? SECRET : undefined),
  } as unknown as ConfigService;
  return new EncryptionService(config);
}

/** Produces a value in the pre-GCM `<iv>:<ciphertext>` format. */
function legacyCbcEncrypt(plaintext: string): string {
  const key = crypto.scryptSync(
    SECRET,
    Buffer.from('upz-github-token-kdf-v1'),
    32,
  );
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

describe('EncryptionService', () => {
  it('round-trips a value', () => {
    const service = makeService();
    const token = 'gho_exampleGitHubAccessToken';
    expect(service.decrypt(service.encrypt(token))).toBe(token);
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const service = makeService();
    expect(service.encrypt('same input')).not.toBe(
      service.encrypt('same input'),
    );
  });

  it('rejects a tampered ciphertext instead of returning altered plaintext', () => {
    const service = makeService();
    const encrypted = service.encrypt('gho_exampleGitHubAccessToken');
    const [prefix, iv, authTag, payload] = encrypted.split(':');

    // Flip the last byte of the ciphertext — under CBC this decrypted to
    // corrupted-but-accepted plaintext; GCM's auth tag must catch it.
    const flipped =
      payload.slice(0, -2) + (payload.slice(-2) === 'ff' ? '00' : 'ff');

    expect(() =>
      service.decrypt([prefix, iv, authTag, flipped].join(':')),
    ).toThrow();
  });

  it('rejects a ciphertext whose auth tag has been swapped out', () => {
    const service = makeService();
    const [prefix, iv, , payload] = service.encrypt('secret').split(':');
    const forgedTag = crypto.randomBytes(16).toString('hex');

    expect(() =>
      service.decrypt([prefix, iv, forgedTag, payload].join(':')),
    ).toThrow();
  });

  it('still decrypts values written by the previous CBC implementation', () => {
    const service = makeService();
    const token = 'gho_legacyTokenStoredBeforeTheGcmMigration';

    expect(service.decrypt(legacyCbcEncrypt(token))).toBe(token);
  });

  it('throws when the configured key is missing', () => {
    const config = { get: () => undefined } as unknown as ConfigService;
    expect(() => new EncryptionService(config)).toThrow(/ENCRYPTION_KEY/);
  });
});
