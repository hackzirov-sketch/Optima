import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Postgres resolves the type of COALESCE/GREATEST/LEAST/NULLIF from their
 * arguments alone, before the target column is considered. Give one of them
 * two bare placeholders and there is nothing to resolve against, so the whole
 * expression comes back as `text` — and the insert dies with
 * "column X is of type integer but expression is of type text".
 *
 * This is invisible in review (the SQL looks fine), invisible to TypeScript,
 * and invisible to any test that mocks the database. It shipped in
 * MeetingsService.create as `COALESCE($8, $13)` and broke *every* meeting
 * creation until someone tried it against a real Postgres.
 *
 * One placeholder next to a literal or a column is fine — those carry a type.
 * Only a pair of placeholders is ambiguous, so that is what this looks for.
 */
const AMBIGUOUS = [
  /\b(COALESCE|GREATEST|LEAST|NULLIF)\(\s*\$\d+\s*,\s*\$\d+\s*\)/i,
  // Same resolution rule, different shape: both branches of a CASE have to
  // agree on a type, and two placeholders agree on nothing.
  /\bTHEN\s+\$\d+\s+ELSE\s+\$\d+/i,
];

describe('raw SQL — parameter type inference', () => {
  const root = join(__dirname, '..', '..');

  function findSourceFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return findSourceFiles(path);
      if (!entry.name.endsWith('.ts') || entry.name.endsWith('.spec.ts')) return [];
      return /\b(COALESCE|GREATEST|LEAST|NULLIF|CASE)\b/i.test(readFileSync(path, 'utf8')) ? [path] : [];
    });
  }

  const sourceFiles = findSourceFiles(root);

  it('never leaves two placeholders in one type-resolving expression', () => {
    const offenders: string[] = [];
    for (const path of sourceFiles) {
      readFileSync(path, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          if (AMBIGUOUS.some((pattern) => pattern.test(line)))
            offenders.push(
              `${path.replace(root, 'src')}:${index + 1} — ${line.trim()}`,
            );
        });
    }

    // Add an explicit cast to at least one argument (`COALESCE($8::int, $13)`)
    // rather than removing this check.
    expect(offenders).toEqual([]);
  });
});
