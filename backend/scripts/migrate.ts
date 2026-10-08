import 'dotenv/config';
import { Pool } from 'pg';
import { Logger } from '@nestjs/common';
import { runMigrations } from '../src/database/migrations/migration.runner';

/**
 * Standalone migration runner: `npm run migration:run`.
 *
 * Applies every pending file in src/database/migrations/sql, in order,
 * using the exact same runner the app calls on boot (DatabaseModule) —
 * so this is safe to run by hand (e.g. to apply a fixed migration without
 * cycling the whole server) and safe to run again if it fails partway
 * (each file runs in its own transaction; already-applied files are
 * skipped based on the schema_migrations table).
 */
async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set (check your .env file)');
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const logger = new Logger('Migrations');

  try {
    const result = await runMigrations(pool, logger);
    if (result.applied.length > 0) {
      logger.log(`Done — applied: ${result.applied.join(', ')}`);
    } else {
      logger.log('Done — nothing to apply, schema already up to date.');
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
