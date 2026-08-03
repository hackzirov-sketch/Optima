import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * Symmetric encryption for third-party credentials at rest (currently GitHub
 * access/refresh tokens).
 *
 * AES-256-GCM, not CBC: CBC is unauthenticated, so a ciphertext sitting in the
 * DB can be altered without detection and will still decrypt — to plaintext the
 * attacker had partial control over. For a value handed straight to the GitHub
 * API that matters, and CBC's padding failures are the classic padding-oracle
 * surface. GCM's auth tag turns tampering into a hard decrypt error instead.
 *
 * Format: `v2:<iv>:<authTag>:<ciphertext>`, all hex. Values written by the
 * previous CBC implementation (`<iv>:<ciphertext>`) are still readable — see
 * decrypt() — so this is a drop-in change that doesn't strand existing rows.
 * They become v2 the next time they're written, which for GitHub tokens is the
 * user's next OAuth login.
 */
@Injectable()
export class EncryptionService {
  private static readonly V2_PREFIX = 'v2';
  private readonly logger = new Logger(EncryptionService.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly legacyAlgorithm = 'aes-256-cbc';
  private readonly key: Buffer;

  constructor(private configService: ConfigService) {
    const secret = this.configService.get<string>('github.encryptionKey');
    if (!secret) {
      throw new Error(
        'ENCRYPTION_KEY env variable is required. Set it in your .env file.',
      );
    }
    // Domain-specific static salt — prevents rainbow table attacks across
    // different apps using the same ENCRYPTION_KEY value. Deliberately
    // unchanged from the CBC version: the same derived key has to open the
    // legacy values too.
    const SALT = Buffer.from('upz-github-token-kdf-v1');
    this.key = crypto.scryptSync(secret, SALT, 32);
  }

  encrypt(text: string): string {
    // 96-bit IV is the GCM standard: at that length it's used directly as the
    // nonce with no extra derivation, and it's the size the collision bounds
    // are stated for.
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(text, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return [
      EncryptionService.V2_PREFIX,
      iv.toString('hex'),
      authTag.toString('hex'),
      encrypted.toString('hex'),
    ].join(':');
  }

  decrypt(encryptedText: string): string {
    const parts = encryptedText.split(':');

    if (parts[0] === EncryptionService.V2_PREFIX) {
      const [, ivHex, authTagHex, payloadHex] = parts;
      if (!ivHex || !authTagHex || !payloadHex) return encryptedText;

      const decipher = crypto.createDecipheriv(
        this.algorithm,
        this.key,
        Buffer.from(ivHex, 'hex'),
      );
      decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
      // final() throws on a bad tag instead of returning garbage. That throw
      // is the whole point of moving off CBC, so it isn't swallowed here.
      return Buffer.concat([
        decipher.update(Buffer.from(payloadHex, 'hex')),
        decipher.final(),
      ]).toString('utf8');
    }

    return this.decryptLegacyCbc(encryptedText, parts);
  }

  /** Reads `<iv>:<ciphertext>` values written before the move to GCM. */
  private decryptLegacyCbc(encryptedText: string, parts: string[]): string {
    const [ivHex, encrypted] = parts;
    if (!ivHex || !encrypted) return encryptedText;

    try {
      const decipher = crypto.createDecipheriv(
        this.legacyAlgorithm,
        this.key,
        Buffer.from(ivHex, 'hex'),
      );
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      this.logger.debug(
        'Decrypted a legacy CBC value — it will be re-encrypted as v2 on next write',
      );
      return decrypted;
    } catch {
      throw new Error('Failed to decrypt stored credential');
    }
  }
}
