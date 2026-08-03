import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ViolationService } from './violation.service';
import { ErrorCode } from '../../../common/enums/error-code.enum';

export interface ImageValidationResult {
  valid: boolean;
  reason?: string;
}

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_DIMENSION = 8000; // px — guards against DoS via huge canvas

@Injectable()
export class ImageModerationService {
  private readonly logger = new Logger(ImageModerationService.name);

  constructor(private readonly violationService: ViolationService) {}

  /**
   * Validate an image fetched from a URL.
   * Throws BadRequestException if the file is invalid.
   */
  async filterImageUrl(imageUrl: string, userId?: string): Promise<void> {
    let buffer: Buffer;
    try {
      const res = await fetch(imageUrl, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Could not fetch image for validation',
        });
      }
      const ab = await res.arrayBuffer();
      buffer = Buffer.from(ab);
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      this.logger.warn(
        `Image fetch failed url=${imageUrl}: ${(err as Error).message}`,
      );
      return; // Network issues — allow through (fail open for URL fetch)
    }

    await this.validateBuffer(buffer, userId);
  }

  /**
   * Validate a base64-encoded image (for direct uploads).
   * Throws BadRequestException if the file is invalid.
   */
  async filterImageBase64(base64: string, userId?: string): Promise<void> {
    const raw = base64.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(raw, 'base64');
    await this.validateBuffer(buffer, userId);
  }

  private async validateBuffer(buffer: Buffer, userId?: string): Promise<void> {
    const result = this.checkBuffer(buffer);
    if (result.valid) return;

    this.logger.warn(
      `Image rejected user=${userId ?? 'anonymous'} reason=${result.reason}`,
    );

    if (userId) {
      await this.violationService.recordViolation(
        userId,
        'image',
        result.reason ?? 'invalid image',
      );
      await this.violationService.assertNotBlocked(userId);
    }

    throw new BadRequestException({
      code: ErrorCode.VALIDATION_ERROR,
      message: `Image rejected: ${result.reason}`,
    });
  }

  checkBuffer(buffer: Buffer): ImageValidationResult {
    // Size check
    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      return {
        valid: false,
        reason: `file too large (max ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB)`,
      };
    }

    if (buffer.length < 4) {
      return { valid: false, reason: 'file too small to be a valid image' };
    }

    // Magic bytes check
    const mime = this.detectMime(buffer);
    if (!mime) {
      return {
        valid: false,
        reason: 'unsupported or fake image format (magic bytes mismatch)',
      };
    }

    // Dimension check via simple parser (no dependencies)
    const dims = this.readDimensions(buffer, mime);
    if (dims) {
      if (dims.width > MAX_DIMENSION || dims.height > MAX_DIMENSION) {
        return {
          valid: false,
          reason: `image dimensions too large (${dims.width}×${dims.height}, max ${MAX_DIMENSION}px)`,
        };
      }
    }

    return { valid: true };
  }

  private detectMime(buf: Buffer): string | null {
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
      return 'image/jpeg';
    if (
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47
    )
      return 'image/png';
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46)
      return 'image/gif';
    if (buf[0] === 0x42 && buf[1] === 0x4d) return 'image/bmp';
    // WebP: RIFF????WEBP
    if (
      buf[0] === 0x52 &&
      buf[1] === 0x49 &&
      buf[2] === 0x46 &&
      buf[3] === 0x46 &&
      buf[8] === 0x57 &&
      buf[9] === 0x45 &&
      buf[10] === 0x42 &&
      buf[11] === 0x50
    )
      return 'image/webp';

    return null;
  }

  private readDimensions(
    buf: Buffer,
    mime: string,
  ): { width: number; height: number } | null {
    try {
      if (mime === 'image/png') {
        // PNG: width at bytes 16-19, height at 20-23 (big-endian)
        if (buf.length < 24) return null;
        return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
      }

      if (mime === 'image/jpeg') {
        // Scan JPEG SOF markers (0xFFC0, 0xFFC2, etc.)
        let i = 2;
        while (i < buf.length - 9) {
          if (buf[i] !== 0xff) break;
          const marker = buf[i + 1];
          // SOF markers: C0, C1, C2, C3, C5, C6, C7, C9, CA, CB, CD, CE, CF
          if (
            (marker >= 0xc0 && marker <= 0xc3) ||
            (marker >= 0xc5 && marker <= 0xc7) ||
            (marker >= 0xc9 && marker <= 0xcb) ||
            (marker >= 0xcd && marker <= 0xcf)
          ) {
            const height = buf.readUInt16BE(i + 5);
            const width = buf.readUInt16BE(i + 7);
            return { width, height };
          }
          const segLen = buf.readUInt16BE(i + 2);
          i += 2 + segLen;
        }
        return null;
      }

      if (mime === 'image/webp') {
        // VP8 chunk: width/height at specific offsets
        if (buf.length < 30) return null;
        // VP8 (lossy): "VP8 " at offset 12
        if (
          buf[12] === 0x56 &&
          buf[13] === 0x50 &&
          buf[14] === 0x38 &&
          buf[15] === 0x20
        ) {
          const width = (buf.readUInt16LE(26) & 0x3fff) + 1;
          const height = (buf.readUInt16LE(28) & 0x3fff) + 1;
          return { width, height };
        }
        // VP8L (lossless): "VP8L" at offset 12
        if (
          buf[12] === 0x56 &&
          buf[13] === 0x50 &&
          buf[14] === 0x38 &&
          buf[15] === 0x4c
        ) {
          const bits = buf.readUInt32LE(21);
          const width = (bits & 0x3fff) + 1;
          const height = ((bits >> 14) & 0x3fff) + 1;
          return { width, height };
        }
        return null;
      }
    } catch {
      return null;
    }

    return null;
  }
}
