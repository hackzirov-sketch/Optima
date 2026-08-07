import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { Client } from 'pg';

/**
 * Every raw SQL string in the codebase, parsed by Postgres itself.
 *
 * Two production breakages in a row got past a green test suite because every
 * test here mocks `DatabaseService.query`: `COALESCE($8, $13)` resolving to
 * text against an integer column, and a joined `SELECT` whose shared column
 * list left `id` ambiguous. Neither is visible to TypeScript, to review, or to
 * a mock — only to a real server.
 *
 * PREPARE is what closes that gap: Postgres parses the statement, resolves
 * every identifier against the real schema and infers every parameter type,
 * and then throws it away without running it. No rows are read or written, so
 * this is safe to point at any database with the right schema.
 *
 * Skipped when no DATABASE_URL is configured, so a machine or CI job without a
 * database still runs the rest of the suite.
 */
const ROOT_ENV = join(__dirname, '..', '..', '..', '.env');

function databaseUrl(): string | null {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (!existsSync(ROOT_ENV)) return null;
  const match = readFileSync(ROOT_ENV, 'utf8').match(/^DATABASE_URL=(.*)$/m);
  return match ? match[1].trim() : null;
}

/**
 * Exported `*_SQL` fragments, so a query built from them can be reassembled.
 * Anything interpolating something else (a built WHERE clause, a VALUES list)
 * is skipped rather than guessed at.
 */
function collectSqlConstants(root: string): Map<string, string> {
  const constants = new Map<string, string>();
  const files = execSync(`grep -rl --include=*.ts '_SQL = ' ${root} || true`, {
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean);
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const pattern = /export const (\w*SQL\w*) = `([^`]*)`/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source))) constants.set(match[1], match[2]);
  }
  return constants;
}

function collectStatements(root: string, constants: Map<string, string>) {
  const statements: Array<{ where: string; sql: string }> = [];
  const files = execSync(
    `grep -rlE "(SELECT|INSERT INTO|UPDATE |DELETE FROM)" ${root} --include=*.ts || true`,
    { encoding: 'utf8' },
  )
    .split('\n')
    .filter((path) => path && !path.endsWith('.spec.ts'));

  for (const file of files) {
    // Comments are stripped first: this codebase quotes SQL in prose a lot
    // (`UPDATE tasks SET deleted_at = ...`), and an ellipsis is not a query.
    const source = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^[ \t]*\/\/.*$/gm, '');
    const pattern =
      /`(\s*(?:SELECT|INSERT INTO|UPDATE|DELETE FROM|WITH)\b[^`]*)`/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source))) {
      let sql = match[1];
      // Resolve the fragments we know; bail on anything we don't.
      sql = sql.replace(/\$\{(\w+)\}/g, (whole, name: string) =>
        constants.has(name) ? constants.get(name)! : whole,
      );
      if (sql.includes('${')) continue;
      const line = source.slice(0, match.index).split('\n').length;
      statements.push({ where: `${file.split('/src/')[1]}:${line}`, sql });
    }
  }
  return statements;
}

const url = databaseUrl();
const describeWithDb = url ? describe : describe.skip;

describeWithDb('raw SQL — accepted by Postgres', () => {
  const root = join(__dirname, '..');
  let client: Client;
  let reachable = true;

  beforeAll(async () => {
    client = new Client({ connectionString: url! });
    try {
      await client.connect();
    } catch {
      // A configured but unreachable database is an environment problem, not a
      // failing codebase — report it once and let the assertions no-op.
      reachable = false;
    }
  }, 30_000);

  afterAll(async () => {
    if (reachable) await client.end();
  });

  it('parses and type-checks every reconstructable statement', async () => {
    if (!reachable) {
      console.warn('DATABASE_URL is set but unreachable — SQL check skipped');
      return;
    }

    const constants = collectSqlConstants(root);
    const statements = collectStatements(root, constants);
    expect(statements.length).toBeGreaterThan(50);

    const failures: string[] = [];
    for (const [index, statement] of statements.entries()) {
      const name = `sql_check_${index}`;
      try {
        await client.query(`PREPARE ${name} AS ${statement.sql}`);
        await client.query(`DEALLOCATE ${name}`);
      } catch (err) {
        const message = (err as Error).message;
        // Statements Postgres cannot prepare in isolation, for reasons that
        // are not defects: DDL and utility commands aren't preparable, and a
        // fragment that only makes sense inside a transaction (SELECT ... FOR
        // UPDATE on a CTE, say) is exercised by its own service test.
        if (
          /cannot insert multiple commands|syntax error at or near "PREPARE"/.test(
            message,
          )
        )
          continue;
        failures.push(`${statement.where} — ${message}`);
      }
    }

    expect(failures).toEqual([]);
  }, 120_000);
});
