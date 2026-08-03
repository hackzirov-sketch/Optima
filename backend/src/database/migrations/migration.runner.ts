import { Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

/**
 * Minimal forward-only SQL migration runner.
 *
 * `docker/postgres/init.sql` only ever runs on a *brand new* database (it is
 * mounted into docker-entrypoint-initdb.d), so it can't evolve an existing
 * one — every schema change since the first deploy had to be applied by hand.
 * This closes that gap: `.sql` files in ./sql are applied in filename order,
 * exactly once, inside a transaction, and recorded in `schema_migrations`.
 *
 * Rules:
 *  - Files are immutable once applied. The recorded checksum is compared on
 *    every boot; editing an applied migration is a hard startup error rather
 *    than a silent divergence between environments.
 *  - Every statement must be idempotent where cheaply possible (IF NOT
 *    EXISTS), so a half-applied deploy can be re-run safely.
 *  - An advisory lock serialises concurrent boots (multiple API replicas
 *    starting at once must not race each other).
 */
const ADVISORY_LOCK_KEY = 776_120_001;

export interface MigrationResult {
  applied: string[];
  skipped: number;
}

export async function runMigrations(
  pool: Pool,
  logger = new Logger('Migrations'),
): Promise<MigrationResult> {
  const dir = join(__dirname, 'sql');
  let files: string[];
  try {
    files = readdirSync(dir)
      .filter((name) => name.endsWith('.sql'))
      .sort();
  } catch {
    logger.warn(`No migrations directory at ${dir} — skipping`);
    return { applied: [], skipped: 0 };
  }

  const client = await pool.connect();
  try {
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         name        varchar(255) PRIMARY KEY,
         checksum    varchar(64)  NOT NULL,
         applied_at  timestamptz  NOT NULL DEFAULT now(),
         duration_ms integer      NOT NULL DEFAULT 0
       )`,
    );
    // Blocks until any other booting replica has finished; released with the
    // session, so a crashed process can't wedge the lock forever.
    await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_KEY]);

    const rows = await client.query<{ name: string; checksum: string }>(
      'SELECT name, checksum FROM schema_migrations',
    );
    const already = new Map(rows.rows.map((r) => [r.name, r.checksum]));

    const applied: string[] = [];
    for (const name of files) {
      const sql = readFileSync(join(dir, name), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const recorded = already.get(name);

      if (recorded) {
        if (recorded !== checksum) {
          throw new Error(
            `Migration ${name} was modified after it was applied ` +
              `(recorded ${recorded.slice(0, 12)}, now ${checksum.slice(0, 12)}). ` +
              `Migrations are immutable — add a new one instead.`,
          );
        }
        continue;
      }

      const startedAt = Date.now();
      logger.log(`Applying ${name}`);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          `INSERT INTO schema_migrations (name, checksum, duration_ms)
           VALUES ($1, $2, $3)`,
          [name, checksum, Date.now() - startedAt],
        );
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw new Error(
          `Migration ${name} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      applied.push(name);
      logger.log(`Applied ${name} in ${Date.now() - startedAt}ms`);
    }

    if (applied.length === 0) {
      logger.log(`Schema up to date (${files.length} migrations)`);
    } else {
      logger.log(`Applied ${applied.length} migration(s)`);
    }
    return { applied, skipped: files.length - applied.length };
  } finally {
    await client
      .query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY])
      .catch(() => undefined);
    client.release();
  }
}
