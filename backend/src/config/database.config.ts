import { registerAs } from '@nestjs/config';

/**
 * Pool size had three different defaults — 10 here, 20 in database-provider.ts
 * (the only one that actually reached `pg`) and 20 in env.schema.ts — so the
 * documented value and the running value disagreed depending on which file you
 * read. This is now the one place it is decided, and createPgPool() takes it
 * from here.
 *
 * Sizing: instances x poolSize must stay under the server's max_connections,
 * with headroom for migrations and any admin session. Postgres does not get
 * faster with more connections than it has cores to run them on; a pool that
 * is too large moves the queue from the app into the database, where it is
 * harder to see.
 */
export const DEFAULT_POOL_SIZE = 20;

export default registerAs('database', () => ({
  url: process.env.DATABASE_URL,
  poolSize: parseInt(
    process.env.DATABASE_POOL_SIZE || String(DEFAULT_POOL_SIZE),
    10,
  ),
}));
