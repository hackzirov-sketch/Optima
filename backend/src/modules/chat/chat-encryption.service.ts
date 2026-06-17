import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export interface EncryptedMessage {
  iv: string;
  data: string;
  v: number; // schema version
}

const ALGORITHM = 'aes-256-cbc';
const DOMAIN_SALT = Buffer.from('upz-chat-messages-aes256-v1');
const SCHEMA_VERSION = 1;

@Injectable()
export class ChatEncryptionService {
  private readonly logger = new Logger(ChatEncryptionService.name);
  private readonly key: Buffer | null = null;

  constructor() {
    const secret = process.env.CHAT_ENCRYPTION_KEY;
    if (secret) {
      this.key = crypto.scryptSync(secret, DOMAIN_SALT, 32);
      this.logger.log('Chat message encryption enabled (AES-256-CBC)');
    } else {
      this.logger.warn('CHAT_ENCRYPTION_KEY not set — messages stored as plaintext');
    }
  }

  isEnabled(): boolean {
    return this.key !== null;
  }

  encrypt(text: string): EncryptedMessage {
    if (!this.key) throw new Error('Encryption key not configured');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(text, 'utf8'),
      cipher.final(),
    ]);
    return {
      iv: iv.toString('base64'),
      data: encrypted.toString('base64'),
      v: SCHEMA_VERSION,
    };
  }

  decrypt(payload: EncryptedMessage): string {
    if (!this.key) throw new Error('Encryption key not configured');
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
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
