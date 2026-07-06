/**
 * Small helpers for hand-written raw SQL, used across services that were
 * migrated off TypeORM Repository/QueryBuilder.
 */

/** camelCase -> snake_case, matching the @Column({ name: '...' }) convention used across all entities. */
export function toSnakeCase(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * Builds a parameterized `SET col1 = $1, col2 = $2, ...` clause from a partial object.
 * `undefined` values are skipped (matches TypeORM's Repository.update semantics);
 * pass `null` explicitly to set a column to NULL.
 *
 * @param data Partial entity data, camelCase keys.
 * @param startIndex 1-based index of the first placeholder (use to continue numbering
 *   after WHERE-clause params that come before the SET values, or leave at 1 when the
 *   SET values are the first params in the query).
 * @param casts Optional map of snake_case column name -> Postgres type to cast to
 *   (e.g. `{ language: 'users_language_enum' }`), needed for enum columns since a
 *   plain string parameter won't implicitly cast against a custom enum type.
 */
export function buildUpdateSet(
  data: Record<string, unknown>,
  startIndex = 1,
  casts: Record<string, string> = {},
): { setClause: string; values: unknown[] } {
  const entries = Object.entries(data).filter(([, v]) => v !== undefined);
  const setClause = entries
    .map(([key], i) => {
      const col = toSnakeCase(key);
      const cast = casts[col] ? `::${casts[col]}` : '';
      return `${col} = $${startIndex + i}${cast}`;
    })
    .join(', ');
  const values = entries.map(([, v]) => v);
  return { setClause, values };
}

/**
 * TypeORM's DataSource/QueryRunner `.query()` is inconsistent for raw SQL on Postgres:
 * SELECT and INSERT ... RETURNING resolve to a plain `Row[]`, but UPDATE ... RETURNING
 * and DELETE ... RETURNING resolve to a `[Row[], affectedCount]` tuple instead.
 *
 * Wrap the result of any UPDATE/DELETE ... RETURNING query in this before indexing
 * into it, or you'll silently get the wrong shape back (an array wrapping an array,
 * instead of the row itself).
 */
export function normalizeReturning<T = any>(result: unknown): T[] {
  if (
    Array.isArray(result) &&
    result.length === 2 &&
    Array.isArray(result[0]) &&
    typeof result[1] === 'number'
  ) {
    return result[0] as T[];
  }
  return result as T[];
}
