import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '../../../common/enums/error-code.enum';

export type ViolationType = 'text' | 'image' | 'spam';

export interface ViolationStatus {
  blocked: boolean;
  isPermanent: boolean;
  blockedUntil: Date | null;
  count: number;
}

interface ViolationRow {
  id: string;
  userId: string;
  type: string;
  count: number;
  blockedUntil: Date | null;
  isPermanent: boolean;
  reason: string | null;
}

@Injectable()
export class ViolationService {
  private readonly logger = new Logger(ViolationService.name);

  constructor(
    private readonly dataSource: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  async recordViolation(
    userId: string,
    type: ViolationType,
    reason: string,
  ): Promise<ViolationStatus> {
    const blockDurations: number[] = this.config.get<number[]>(
      'moderation.blockDurationsMinutes',
    ) ?? [15, 30];
    const permanentThreshold =
      this.config.get<number>('moderation.permanentBlockThreshold') ?? 3;

    return this.dataSource.withTransaction(async (query) => {
      // Lock any existing row for this user to avoid a lost-update race when two
      // violations land concurrently (e.g. two flagged messages sent back to back).
      const existingRows: ViolationRow[] = await query(
        `SELECT id, user_id AS "userId", type, count, blocked_until AS "blockedUntil",
                is_permanent AS "isPermanent", reason
         FROM user_violations WHERE user_id = $1 FOR UPDATE`,
        [userId],
      );
      const existing = existingRows[0];

      const count = (existing?.count ?? 0) + 1;
      const now = new Date();
      let isPermanent = false;
      let blockedUntil: Date | null = null;

      if (count >= permanentThreshold) {
        isPermanent = true;
        blockedUntil = null;
        this.logger.warn(
          `User ${userId} permanently blocked after ${count} violations`,
        );
      } else {
        const minutes =
          blockDurations[count - 1] ??
          blockDurations[blockDurations.length - 1];
        blockedUntil = new Date(now.getTime() + minutes * 60 * 1000);
        this.logger.warn(
          `User ${userId} temp-blocked for ${minutes} min (violation #${count})`,
        );
      }

      if (existing) {
        await query(
          `UPDATE user_violations
           SET count = $2, type = $3, reason = $4, blocked_until = $5, is_permanent = $6, updated_at = now()
           WHERE user_id = $1`,
          [userId, count, type, reason, blockedUntil, isPermanent],
        );
      } else {
        await query(
          `INSERT INTO user_violations (user_id, type, count, reason, blocked_until, is_permanent)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [userId, type, count, reason, blockedUntil, isPermanent],
        );
      }

      return { blocked: true, isPermanent, blockedUntil, count };
    });
  }

  async getStatus(userId: string): Promise<ViolationStatus> {
    const rows: ViolationRow[] = await this.dataSource.query(
      `SELECT id, user_id AS "userId", type, count, blocked_until AS "blockedUntil",
              is_permanent AS "isPermanent", reason
       FROM user_violations WHERE user_id = $1`,
      [userId],
    );
    const record = rows[0];
    if (!record)
      return {
        blocked: false,
        isPermanent: false,
        blockedUntil: null,
        count: 0,
      };

    if (record.isPermanent) {
      return {
        blocked: true,
        isPermanent: true,
        blockedUntil: null,
        count: record.count,
      };
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

    return {
      blocked: false,
      isPermanent: false,
      blockedUntil: null,
      count: record.count,
    };
  }

  /** Throws ForbiddenException if user is currently blocked. Call at start of sensitive actions. */
  async assertNotBlocked(userId: string): Promise<void> {
    const status = await this.getStatus(userId);
    if (!status.blocked) return;

    if (status.isPermanent) {
      throw new ForbiddenException({
        code: ErrorCode.ACCOUNT_SUSPENDED,
        message:
          'Your account has been permanently suspended due to repeated violations.',
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
