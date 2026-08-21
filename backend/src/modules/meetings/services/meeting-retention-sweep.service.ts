import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { MeetingsService } from '../meetings.service';
import { MEETING_RETENTION_SWEEP_INTERVAL_MS } from '../meetings.constants';

/**
 * Owns the timer behind MeetingsService.sweepExpiredInactiveMeetings — same
 * shape as LastSeenFlushService: a separate provider so the schedule can be
 * disabled, tested, or moved to a worker without touching MeetingsService
 * itself.
 *
 * What this closes: an INACTIVE meeting (empty room, link still valid — see
 * MeetingsService.deactivateMeeting) doesn't hold any live resource open —
 * no socket, no media session, no TURN allocation, just a Postgres row — so
 * there is nothing urgent to clean up. But an abandoned link shouldn't stay
 * joinable forever either, so once in a while this finds rooms that have
 * been empty for MEETING_INACTIVE_RETENTION_DAYS and finally marks them
 * ENDED. Safe to run on every instance: the UPDATE is a plain SQL statement,
 * not a per-row job, so concurrent sweeps just do the same idempotent write.
 */
@Injectable()
export class MeetingRetentionSweepService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(MeetingRetentionSweepService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly meetingsService: MeetingsService) {}

  onModuleInit(): void {
    this.timer = setInterval(
      () => void this.sweep(),
      MEETING_RETENTION_SWEEP_INTERVAL_MS,
    );
    // Don't hold the event loop open for this — shutdown shouldn't wait out
    // the interval.
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async sweep(): Promise<void> {
    try {
      const count = await this.meetingsService.sweepExpiredInactiveMeetings();
      if (count > 0)
        this.logger.log(`Retired ${count} long-abandoned meeting(s)`);
    } catch (err) {
      // Never throw from a timer — the next tick just retries.
      this.logger.warn(
        `Meeting retention sweep failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
