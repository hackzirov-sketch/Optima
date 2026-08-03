import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient, QueryResultRow } from 'pg';
import { PG_POOL } from './database-provider';

/**
 * Drop-in replacement for TypeORM's `DataSource` as used throughout this
 * codebase — every service already talks to Postgres exclusively via raw
 * SQL (`this.dataSource.query(sql, params)`), never the ORM/repository
 * layer, so `query()` here has the exact same signature and return shape
 * (a plain row array) on purpose: call sites don't need to change, only
 * the injected type/token does.
 */
@Injectable()
export class DatabaseService implements OnModuleDestroy {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async query<T extends QueryResultRow = any>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]> {
    const result = await this.pool.query<T>(sql, params);
    return result.rows;
  }

  /** Escape hatch for call sites that need a single connection for a
   * transaction (BEGIN/COMMIT/ROLLBACK) instead of a one-off pooled query. */
  async getClient(): Promise<PoolClient> {
    return this.pool.connect();
  }

  /**
   * Runs `fn` inside a single transaction on a dedicated connection —
   * replaces TypeORM's `dataSource.createQueryRunner()` +
   * connect/startTransaction/commit/rollback/release dance. `fn` receives a
   * `query()` bound to that connection, same shape as the plain `query()`
   * above, so the SQL inside a transaction doesn't need to change from the
   * non-transactional call sites — commits on success, rolls back and
   * rethrows on any error, always releases the connection.
   */
  async withTransaction<T>(
    fn: (
      query: <R extends QueryResultRow = any>(
        sql: string,
        params?: unknown[],
      ) => Promise<R[]>,
    ) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    const query = async <R extends QueryResultRow = any>(
      sql: string,
      params?: unknown[],
    ) => (await client.query<R>(sql, params)).rows;
    try {
      await client.query('BEGIN');
      const result = await fn(query);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
