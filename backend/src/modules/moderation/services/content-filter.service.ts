import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { BannedContent } from '../../../database/entities/banned-content.entity';
import { ErrorCode } from '../../../common/enums/error-code.enum';
import { ViolationService } from './violation.service';

export interface FilterResult {
  flagged: boolean;
  reason?: string;
  category?: string;
}

interface OpenAIModerationResult {
  flagged: boolean;
  categories: Record<string, boolean>;
}

@Injectable()
export class ContentFilterService {
  private readonly logger = new Logger(ContentFilterService.name);
  // In-memory cache of banned patterns, refreshed every 5 minutes
  private patternCache: BannedContent[] = [];
  private cacheExpiry = 0;

  constructor(
    @InjectRepository(BannedContent)
    private readonly bannedRepo: Repository<BannedContent>,
    private readonly config: ConfigService,
    private readonly violationService: ViolationService,
  ) {}

  /**
   * Main entry point. Checks text, logs violation if flagged, throws if content is bad.
   * Call from: chat.service.ts sendMessage, users.service.ts updateProfile, etc.
   */
  async filterText(
    text: string,
    userId?: string,
    context = 'text',
  ): Promise<void> {
    const result = await this.check(text);
    if (!result.flagged) return;

    this.logger.warn(
      `Content flagged for user=${userId ?? 'anonymous'} context=${context} reason=${result.reason}`,
    );

    if (userId) {
      await this.violationService.recordViolation(userId, 'text', result.reason ?? 'content violation');
      await this.violationService.assertNotBlocked(userId);
    }

    throw new BadRequestException({
      code: ErrorCode.VALIDATION_ERROR,
      message: `Content violates community guidelines: ${result.reason ?? 'inappropriate content'}`,
    });
  }

  /** Check without auto-recording violation — useful for inspection without side effects */
  async check(text: string): Promise<FilterResult> {
    if (!text?.trim()) return { flagged: false };

    // Step 1: Fast local regex/word check
    const localResult = await this.checkLocal(text);
    if (localResult.flagged) return localResult;

    // Step 2: OpenAI Moderation API (free, runs only when key is set)
    const apiKey = this.config.get<string>('moderation.openaiApiKey');
    if (apiKey) {
      return this.checkOpenAI(text, apiKey);
    }

    return { flagged: false };
  }

  private async checkLocal(text: string): Promise<FilterResult> {
    const patterns = await this.getPatternCache();
    const lower = text.toLowerCase();

    for (const entry of patterns) {
      if (entry.isRegex) {
        try {
          const re = new RegExp(entry.pattern, 'i');
          if (re.test(text)) {
            return { flagged: true, reason: `matches banned pattern`, category: entry.category ?? undefined };
          }
        } catch {
          // Invalid regex in DB — skip
        }
      } else {
        if (lower.includes(entry.pattern.toLowerCase())) {
          return { flagged: true, reason: `contains banned word/phrase`, category: entry.category ?? undefined };
        }
      }
    }

    return { flagged: false };
  }

  private async checkOpenAI(text: string, apiKey: string): Promise<FilterResult> {
    try {
      const res = await fetch('https://api.openai.com/v1/moderations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ input: text }),
      });

      if (!res.ok) {
        this.logger.warn(`OpenAI Moderation API error: ${res.status}`);
        return { flagged: false };
      }

      const data = (await res.json()) as { results: Array<OpenAIModerationResult> };
      const result = data.results?.[0];
      if (!result?.flagged) return { flagged: false };

      const flaggedCategories = Object.entries(result.categories)
        .filter(([, v]) => v)
        .map(([k]) => k);

      return {
        flagged: true,
        reason: `AI moderation: ${flaggedCategories.join(', ')}`,
        category: flaggedCategories[0],
      };
    } catch (err) {
      this.logger.warn(`OpenAI Moderation API unreachable: ${(err as Error).message}`);
      return { flagged: false };
    }
  }

  private async getPatternCache(): Promise<BannedContent[]> {
    const now = Date.now();
    if (now < this.cacheExpiry) return this.patternCache;

    this.patternCache = await this.bannedRepo.find({ where: { active: true } });
    this.cacheExpiry = now + 5 * 60 * 1000; // 5 min TTL
    return this.patternCache;
  }

  /** Force-reload the pattern cache (call after adding new banned words via admin API) */
  invalidateCache(): void {
    this.cacheExpiry = 0;
  }
}
