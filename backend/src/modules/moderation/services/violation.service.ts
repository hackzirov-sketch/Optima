import {
  Injectable,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { UserViolation } from '../../../database/entities/user-violation.entity';
import { ErrorCode } from '../../../common/enums/error-code.enum';

export type ViolationType = 'text' | 'image' | 'spam';

export interface ViolationStatus {
  blocked: boolean;
  isPermanent: boolean;
  blockedUntil: Date | null;
  count: number;
}

@Injectable()
export class ViolationService {
  private readonly logger = new Logger(ViolationService.name);

  constructor(
    @InjectRepository(UserViolation)
    private readonly repo: Repository<UserViolation>,
    private readonly config: ConfigService,
  ) {}

  async recordViolation(
    userId: string,
    type: ViolationType,
    reason: string,
  ): Promise<ViolationStatus> {
    const blockDurations: number[] =
      this.config.get<number[]>('moderation.blockDurationsMinutes') ?? [15, 30];
    const permanentThreshold =
      this.config.get<number>('moderation.permanentBlockThreshold') ?? 3;

    let record = await this.repo.findOne({ where: { userId } });

    if (!record) {
      record = this.repo.create({ userId, type, count: 0, reason });
    }

    record.count += 1;
    record.type = type;
    record.reason = reason;

    const now = new Date();

    if (record.count >= permanentThreshold) {
      record.isPermanent = true;
      record.blockedUntil = null;
      this.logger.warn(`User ${userId} permanently blocked after ${record.count} violations`);
    } else {
      const minutes = blockDurations[record.count - 1] ?? blockDurations[blockDurations.length - 1];
      record.blockedUntil = new Date(now.getTime() + minutes * 60 * 1000);
      record.isPermanent = false;
      this.logger.warn(`User ${userId} temp-blocked for ${minutes} min (violation #${record.count})`);
    }

    await this.repo.save(record);

    return {
      blocked: true,
      isPermanent: record.isPermanent,
      blockedUntil: record.blockedUntil,
      count: record.count,
    };
  }

  async getStatus(userId: string): Promise<ViolationStatus> {
    const record = await this.repo.findOne({ where: { userId } });
    if (!record) return { blocked: false, isPermanent: false, blockedUntil: null, count: 0 };

    if (record.isPermanent) {
      return { blocked: true, isPermanent: true, blockedUntil: null, count: record.count };
    }

    const now = new Date();
    if (record.blockedUntil && record.blockedUntil > now) {
      return {
        blocked: true,
        isPermanent: false,
        blockedUntil: record.blockedUntil,
        count: record.count,
      };
    }

    return { blocked: false, isPermanent: false, blockedUntil: null, count: record.count };
  }

  /** Throws ForbiddenException if user is currently blocked. Call at start of sensitive actions. */
  async assertNotBlocked(userId: string): Promise<void> {
    const status = await this.getStatus(userId);
    if (!status.blocked) return;

    if (status.isPermanent) {
      throw new ForbiddenException({
        code: ErrorCode.ACCOUNT_SUSPENDED,
        message: 'Your account has been permanently suspended due to repeated violations.',
      });
    }

    const retryAfter = status.blockedUntil
      ? Math.ceil((status.blockedUntil.getTime() - Date.now()) / 1000)
      : 0;

    throw new ForbiddenException({
      code: ErrorCode.ACCOUNT_SUSPENDED,
      message: `Your account is temporarily suspended. Try again in ${Math.ceil(retryAfter / 60)} minute(s).`,
      retryAfter,
    });
  }
}
