import { buildUpdateSet, normalizeReturning, toSnakeCase } from './sql.util';

describe('toSnakeCase', () => {
  it('converts camelCase to snake_case', () => {
    expect(toSnakeCase('firstName')).toBe('first_name');
    expect(toSnakeCase('needsPasswordSetup')).toBe('needs_password_setup');
    expect(toSnakeCase('id')).toBe('id');
  });
});

describe('buildUpdateSet', () => {
  it('builds a parameterized SET clause', () => {
    const { setClause, values } = buildUpdateSet({
      firstName: 'Ada',
      isActive: true,
    });

    expect(setClause).toBe('first_name = $1, is_active = $2');
    expect(values).toEqual(['Ada', true]);
  });

  it('skips undefined but keeps explicit null', () => {
    const { setClause, values } = buildUpdateSet({
      firstName: undefined,
      avatarUrl: null,
    });

    expect(setClause).toBe('avatar_url = $1');
    expect(values).toEqual([null]);
  });

  it('continues placeholder numbering from startIndex', () => {
    const { setClause } = buildUpdateSet({ title: 't', status: 's' }, 3);
    expect(setClause).toBe('title = $3, status = $4');
  });

  it('applies a configured enum cast', () => {
    const { setClause } = buildUpdateSet({ language: 'uz' }, 1, {
      language: 'users_language_enum',
    });
    expect(setClause).toBe('language = $1::users_language_enum');
  });

  // Column names can't be bound parameters — they land in the SQL text. Every
  // current caller passes a validated DTO, but that must not be the only thing
  // standing between an object key and injected SQL.
  describe('identifier safety', () => {
    it.each([
      ['is_active = true, is_admin', 'trailing injected assignment'],
      ['id; DROP TABLE users', 'statement terminator'],
      ['id --', 'comment'],
      ['"quoted"', 'quoting'],
      ['id)', 'punctuation'],
      ['', 'empty key'],
      ['1bad', 'leading digit'],
    ])('rejects %p (%s)', (key) => {
      expect(() => buildUpdateSet({ [key]: 'x' })).toThrow(
        /Unsafe column name/,
      );
    });

    it('rejects an unsafe cast type', () => {
      expect(() =>
        buildUpdateSet({ language: 'uz' }, 1, {
          language: 'text; DROP TABLE users',
        }),
      ).toThrow(/Unsafe cast type/);
    });

    it('still accepts ordinary camelCase keys', () => {
      expect(() =>
        buildUpdateSet({ firstName: 'Ada', githubPrUrl: 'x' }),
      ).not.toThrow();
    });
  });
});

describe('normalizeReturning', () => {
  it('unwraps the [rows, count] tuple shape', () => {
    expect(normalizeReturning([[{ id: 1 }], 1])).toEqual([{ id: 1 }]);
  });

  it('passes a plain row array through', () => {
    expect(normalizeReturning([{ id: 1 }])).toEqual([{ id: 1 }]);
  });

  it('does not mistake a two-row result for a tuple', () => {
    const rows = [{ id: 1 }, { id: 2 }];
    expect(normalizeReturning(rows)).toEqual(rows);
  });
});
