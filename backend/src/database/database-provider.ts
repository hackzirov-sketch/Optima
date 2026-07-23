import { Pool } from 'pg';

export const PG_POOL = 'PG_POOL';

/**
 * Plain `pg` connection pool — replaces TypeORM's DataSource. Pool options
 * mirror what the old TypeOrmModule.forRootAsync() `extra` block used, so
 * connection behavior against Neon (keep-alive, timeouts) doesn't change.
 */
export function createPgPool(): Pool {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    max: parseInt(process.env.DATABASE_POOL_SIZE || '20', 10),
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
    idleTimeoutMillis: 60000,
    connectionTimeoutMillis: 5000,
  });
}
