/**
 * OAuth providers are inconsistent about how they express "this address is
 * verified": Google's `email_verified` arrives as a real boolean on the ID
 * token but as the string `"true"` in some userinfo shapes, and GitHub's
 * `verified` is a boolean that can also be absent entirely. Anything that
 * isn't an explicit affirmative is treated as unverified — the whole point is
 * that an attacker-supplied address must not pass.
 */
export function isVerified(flag: unknown): boolean {
  return flag === true || flag === 'true';
}
