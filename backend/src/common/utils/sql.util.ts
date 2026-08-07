/**
 * Small helpers for hand-written raw SQL, used across services that were
 * migrated off TypeORM Repository/QueryBuilder.
 */

/** camelCase -> snake_case, matching the @Column({ name: '...' }) convention used across all entities. */
export function toSnakeCase(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/** A bare snake_case column name — no quoting, whitespace, or punctuation. */
const SAFE_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;
/** `text`, `users_language_enum`, `timestamptz` — optionally schema-qualified. */
const SAFE_TYPE_NAME = /^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/;

/**
 * Column names and casts are the one part of a query that *cannot* be a bound
 * parameter — they're concatenated into the SQL text. Everywhere in this
 * codebase they currently originate from validated DTOs (Zod strips unknown
 * keys; class-validator runs with forbidNonWhitelisted), so nothing
 * attacker-controlled reaches here today. But that safety lives entirely in
 * the call sites: one `@Body()` typed as a loose record, and an attacker's
 * object key becomes SQL. Validating here makes it structural instead.
 */
function assertSafeIdentifier(col: string, source: string): void {
  if (!SAFE_IDENTIFIER.test(col)) {
    throw new Error(
      `Unsafe column name derived from "${source}" — refusing to build SQL`,
    );
  }
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
      assertSafeIdentifier(col, key);

      const castType = casts[col];
      if (castType !== undefined && !SAFE_TYPE_NAME.test(castType)) {
        throw new Error(
          `Unsafe cast type "${castType}" — refusing to build SQL`,
        );
      }
      const cast = castType ? `::${castType}` : '';

      return `${col} = $${startIndex + i}${cast}`;
    })
    .join(', ');
  const values = entries.map(([, v]) => v);
  return { setClause, values };
}
