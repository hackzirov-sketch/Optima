import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export interface EncryptedMessage {
  iv: string;
  data: string;
  authTag: string;
  v: number; // schema version
}

const ALGORITHM = 'aes-256-gcm';
const DOMAIN_SALT = Buffer.from('upz-chat-messages-aes256-v1');
// v2: AES-256-GCM (authenticated encryption). v1 (AES-256-CBC, no auth tag)
// is still decryptable for messages sent before this upgrade — CBC has no
// built-in integrity check, so it's vulnerable to bit-flipping/padding-oracle
// tampering; GCM adds an auth tag that makes any tampering fail loudly
// instead of silently decrypting to garbage (or attacker-controlled bytes).
const SCHEMA_VERSION = 2;
const IV_LENGTH = 12; // 96-bit IV is the NIST-recommended size for GCM (not 16)

@Injectable()
export class ChatEncryptionService {
  private readonly logger = new Logger(ChatEncryptionService.name);
  private readonly key: Buffer | null = null;

  constructor() {
    const secret = process.env.CHAT_ENCRYPTION_KEY;
    if (secret) {
      this.key = crypto.scryptSync(secret, DOMAIN_SALT, 32);
      this.logger.log('Chat message encryption enabled (AES-256-GCM)');
    } else {
      this.logger.warn('CHAT_ENCRYPTION_KEY not set — messages stored as plaintext');
    }
  }

  isEnabled(): boolean {
    return this.key !== null;
  }

  encrypt(text: string): EncryptedMessage {
    if (!this.key) throw new Error('Encryption key not configured');
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(text, 'utf8'),
      cipher.final(),
    ]);
    return {
      iv: iv.toString('base64'),
      data: encrypted.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
      v: SCHEMA_VERSION,
    };
  }

  decrypt(payload: EncryptedMessage): string {
    if (!this.key) throw new Error('Encryption key not configured');

    // v1 (CBC) messages sent before the GCM upgrade have no authTag — decrypt
    // them the old way so message history doesn't break.
    if (payload.v === 1 || !payload.authTag) {
      return this.decryptLegacyCbc(payload);
    }

    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      this.key,
      Buffer.from(payload.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(payload.data, 'base64')),
      decipher.final(), // throws if the auth tag doesn't match — tampering is detected here
    ]).toString('utf8');
  }

  /** Decrypts messages encrypted under the old AES-256-CBC scheme (schema v1, no auth tag). */
  private decryptLegacyCbc(payload: EncryptedMessage): string {
    if (!this.key) throw new Error('Encryption key not configured');
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      this.key,
      Buffer.from(payload.iv, 'base64'),
    );
    return Buffer.concat([
      decipher.update(Buffer.from(payload.data, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  /** Safely decrypt contentJson; falls back to raw content string if not encrypted */
  safeDecrypt(contentJson: EncryptedMessage | null, rawContent: string | null): string {
    if (contentJson && this.key) {
      try {
        return this.decrypt(contentJson);
      } catch (err) {
        this.logger.warn(`Decrypt failed, falling back to raw content: ${err}`);
      }
    }
    return rawContent ?? '';
  }
}
