import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { UsersService } from './users.service';

/**
 * How often staged last_seen timestamps are written back. Short enough that
 * "last seen" stays believable, long enough that the write is one statement
 * per minute per instance instead of one per active user per 30 seconds.
 */
const FLUSH_INTERVAL_MS = 60_000;

/**
 * Owns the timer behind UsersService.flushLastSeen.
 *
 * A separate provider rather than lifecycle hooks on UsersService itself:
 * UsersService is injected all over the app and is about identity, not about
 * running background work. Keeping the schedule here means the flush can be
 * disabled, tested or moved to a worker process without touching it.
 *
 * Safe to run on every instance. The drain is atomic, so instances take
 * disjoint batches rather than duplicating work.
 */
@Injectable()
export class LastSeenFlushService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LastSeenFlushService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly usersService: UsersService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
    // Don't hold the event loop open for this — a shutdown shouldn't wait out
    // the interval, and onModuleDestroy clears it anyway.
    this.timer.unref?.();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    // One last drain, so a clean shutdown doesn't discard the current batch.
    await this.flush();
  }

  private async flush(): Promise<void> {
    try {
      const count = await this.usersService.flushLastSeen();
      if (count > 0) this.logger.debug(`Flushed last_seen for ${count} users`);
    } catch (err) {
      // Never throw from a timer: an unhandled rejection here would be logged
      // by the process guard in main.ts and nothing would retry. The next tick
      // picks up whatever is still staged.
      this.logger.warn(
        `last_seen flush failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
