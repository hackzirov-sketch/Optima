import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ViolationService } from './violation.service';

export interface ImageModerationResult {
  flagged: boolean;
  reason?: string;
  categories?: { adult: boolean; violence: boolean; racy: boolean };
}

type Likelihood = 'UNKNOWN' | 'VERY_UNLIKELY' | 'UNLIKELY' | 'POSSIBLE' | 'LIKELY' | 'VERY_LIKELY';

const DANGEROUS: Likelihood[] = ['LIKELY', 'VERY_LIKELY'];

interface SafeSearchAnnotation {
  adult: Likelihood;
  violence: Likelihood;
  racy: Likelihood;
  spoof: Likelihood;
  medical: Likelihood;
}

@Injectable()
export class ImageModerationService {
  private readonly logger = new Logger(ImageModerationService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly violationService: ViolationService,
  ) {}

  /**
   * Check an image URL via Google SafeSearch. Logs violation if flagged.
   * Call from: storage.controller.ts after upload, or before signing.
   */
  async filterImageUrl(imageUrl: string, userId?: string): Promise<void> {
    const result = await this.checkImageUrl(imageUrl);
    if (!result.flagged) return;

    this.logger.warn(
      `Image flagged for user=${userId ?? 'anonymous'} reason=${result.reason}`,
    );

    if (userId) {
      await this.violationService.recordViolation(userId, 'image', result.reason ?? 'image violation');
      await this.violationService.assertNotBlocked(userId);
    }
  }

  /** Check without side effects */
  async checkImageUrl(imageUrl: string): Promise<ImageModerationResult> {
    const apiKey = this.config.get<string>('moderation.googleVisionApiKey');
    if (!apiKey) return { flagged: false };

    try {
      const res = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: [
              {
                image: { source: { imageUri: imageUrl } },
                features: [{ type: 'SAFE_SEARCH_DETECTION' }],
              },
            ],
          }),
        },
      );

      if (!res.ok) {
        this.logger.warn(`Google Vision API error: ${res.status}`);
        return { flagged: false };
      }

      const data = (await res.json()) as {
        responses: Array<{ safeSearchAnnotation?: SafeSearchAnnotation }>;
      };

      const annotation = data.responses?.[0]?.safeSearchAnnotation;
      if (!annotation) return { flagged: false };

      const adult = DANGEROUS.includes(annotation.adult);
      const violence = DANGEROUS.includes(annotation.violence);
      const racy = DANGEROUS.includes(annotation.racy);
      const flagged = adult || violence || racy;

      if (!flagged) return { flagged: false };

      const reasons: string[] = [];
      if (adult) reasons.push('adult');
      if (violence) reasons.push('violence');
      if (racy) reasons.push('racy');

      return {
        flagged: true,
        reason: `SafeSearch: ${reasons.join(', ')}`,
        categories: { adult, violence, racy },
      };
    } catch (err) {
      this.logger.warn(`Google Vision API unreachable: ${(err as Error).message}`);
      return { flagged: false };
    }
  }

  /** Check base64-encoded image (for direct upload scanning) */
  async checkImageBase64(base64: string, userId?: string): Promise<void> {
    const apiKey = this.config.get<string>('moderation.googleVisionApiKey');
    if (!apiKey) return;

    try {
      const res = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: [
              {
                image: { content: base64.replace(/^data:.*,/, '') },
                features: [{ type: 'SAFE_SEARCH_DETECTION' }],
              },
            ],
          }),
        },
      );

      if (!res.ok) return;

      const data = (await res.json()) as {
        responses: Array<{ safeSearchAnnotation?: SafeSearchAnnotation }>;
      };

      const annotation = data.responses?.[0]?.safeSearchAnnotation;
      if (!annotation) return;

      const adult = DANGEROUS.includes(annotation.adult);
      const violence = DANGEROUS.includes(annotation.violence);
      const racy = DANGEROUS.includes(annotation.racy);

      if (adult || violence || racy) {
        const reasons: string[] = [];
        if (adult) reasons.push('adult');
        if (violence) reasons.push('violence');
        if (racy) reasons.push('racy');

        const reason = `SafeSearch: ${reasons.join(', ')}`;
        this.logger.warn(`Base64 image flagged user=${userId ?? 'anonymous'} reason=${reason}`);

        if (userId) {
          await this.violationService.recordViolation(userId, 'image', reason);
          await this.violationService.assertNotBlocked(userId);
        }
      }
    } catch (err) {
      this.logger.warn(`Google Vision API unreachable: ${(err as Error).message}`);
    }
  }
}
