import { isVerified } from './oauth-email.util';

describe('isVerified', () => {
  it('accepts an explicit affirmative in either provider encoding', () => {
    expect(isVerified(true)).toBe(true);
    expect(isVerified('true')).toBe(true);
  });

  // The whole point is that an attacker-supplied address doesn't pass, so
  // anything ambiguous has to read as unverified.
  it.each([false, 'false', undefined, null, '', 0, 1, 'yes', {}])(
    'treats %p as unverified',
    (value) => {
      expect(isVerified(value)).toBe(false);
    },
  );
});
