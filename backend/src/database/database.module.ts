import { Global, Inject, Logger, Module, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL, createPgPool } from './database-provider';
import { DatabaseService } from './database.service';
import { runMigrations } from './migrations/migration.runner';

@Global()
@Module({
  providers: [{ provide: PG_POOL, useFactory: createPgPool }, DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule implements OnModuleInit {
  private readonly logger = new Logger('Migrations');

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * Migrations run before anything else touches the database — this module is
   * @Global and every other module depends on it, so Nest initialises it
   * first. A failure here aborts startup on purpose: serving traffic against
   * a half-migrated schema is worse than not booting.
   */
  async onModuleInit(): Promise<void> {
    if (process.env.SKIP_MIGRATIONS === 'true') {
      this.logger.warn('SKIP_MIGRATIONS=true — schema left untouched');
      return;
    }
    await runMigrations(this.pool, this.logger);
  }
}
