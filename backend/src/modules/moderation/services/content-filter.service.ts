import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BannedContent } from '../../../database/entities/banned-content.entity';
import { ErrorCode } from '../../../common/enums/error-code.enum';
import { ViolationService } from './violation.service';

export interface FilterResult {
  flagged: boolean;
  reason?: string;
  category?: string;
}

@Injectable()
export class ContentFilterService {
  private readonly logger = new Logger(ContentFilterService.name);
  private patternCache: BannedContent[] = [];
  private cacheExpiry = 0;

  constructor(
    @InjectRepository(BannedContent)
    private readonly bannedRepo: Repository<BannedContent>,
    private readonly violationService: ViolationService,
  ) {}

  async filterText(text: string, userId?: string, context = 'text'): Promise<void> {
    const result = await this.check(text);
    if (!result.flagged) return;

    this.logger.warn(
      `Content flagged user=${userId ?? 'anonymous'} context=${context} reason=${result.reason}`,
    );

    if (userId) {
      await this.violationService.recordViolation(userId, 'text', result.reason ?? 'content violation');
      await this.violationService.assertNotBlocked(userId);
    }

    throw new BadRequestException({
      code: ErrorCode.CONTENT_FLAGGED,
      message: `Content violates community guidelines: ${result.reason ?? 'inappropriate content'}`,
    });
  }

  async check(text: string): Promise<FilterResult> {
    if (!text?.trim()) return { flagged: false };

    const localResult = await this.checkLocal(text);
    if (localResult.flagged) return localResult;

    return this.checkHeuristic(text);
  }

  private async checkLocal(text: string): Promise<FilterResult> {
    const patterns = await this.getPatternCache();
    const lower = text.toLowerCase();

    for (const entry of patterns) {
      if (entry.isRegex) {
        try {
          const re = new RegExp(entry.pattern, 'i');
          if (re.test(text)) {
            return { flagged: true, reason: 'matches banned pattern', category: entry.category ?? undefined };
          }
        } catch {
          // Invalid regex in DB — skip
        }
      } else {
        if (lower.includes(entry.pattern.toLowerCase())) {
          return { flagged: true, reason: 'contains banned word/phrase', category: entry.category ?? undefined };
        }
      }
    }

    return { flagged: false };
  }

  private checkHeuristic(text: string): FilterResult {
    const trimmed = text.trim();

    // Excessive repeated characters: "aaaaaaa" or "!!!!!!"
    if (/(.)\1{9,}/.test(trimmed)) {
      return { flagged: true, reason: 'excessive character repetition', category: 'spam' };
    }

    // Excessive caps (>70% uppercase, min 10 chars)
    if (trimmed.length >= 10) {
      const letters = trimmed.replace(/[^a-zA-Z]/g, '');
      if (letters.length > 5) {
        const upperRatio = (letters.match(/[A-Z]/g) ?? []).length / letters.length;
        if (upperRatio > 0.7) {
          return { flagged: true, reason: 'excessive uppercase (possible spam)', category: 'spam' };
        }
      }
    }

    // Too many URLs (>3 links in one message = spam)
    const urlCount = (trimmed.match(/https?:\/\//gi) ?? []).length;
    if (urlCount > 3) {
      return { flagged: true, reason: 'too many URLs in message', category: 'spam' };
    }

    // Repeated word spam: same word 5+ times
    const words = trimmed.toLowerCase().split(/\s+/);
    if (words.length >= 5) {
      const freq = new Map<string, number>();
      for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
      for (const [word, count] of freq) {
        if (word.length > 2 && count >= 5 && count / words.length > 0.4) {
          return { flagged: true, reason: `repeated word spam: "${word}"`, category: 'spam' };
        }
      }
    }

    return { flagged: false };
  }

  private async getPatternCache(): Promise<BannedContent[]> {
    const now = Date.now();
    if (now < this.cacheExpiry) return this.patternCache;

    // Set expiry optimistically before await to prevent parallel DB queries
    this.cacheExpiry = now + 5 * 60 * 1000;
    this.patternCache = await this.bannedRepo.find({ where: { active: true } });
    return this.patternCache;
  }

  invalidateCache(): void {
    this.cacheExpiry = 0;
  }
}
