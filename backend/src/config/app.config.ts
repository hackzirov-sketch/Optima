import { registerAs } from '@nestjs/config';

/**
 * bcrypt cost factor. 12 is the current sane default — 10 dates from a decade
 * ago and is roughly 4x cheaper to attack offline. The floor is kept at 10 so
 * an existing deployment that pinned a lower value still boots, and the
 * ceiling at 14 keeps a login from turning into a ~1s CPU burn.
 */
function resolveBcryptRounds(): number {
  const raw = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);
  if (Number.isNaN(raw)) return 12;
  return Math.min(14, Math.max(10, raw));
}

/**
 * Comma-separated user IDs allowed to administer platform-wide content
 * (currently the education catalogue). There is no global admin role on the
 * user model — workspace roles are scoped to a workspace and don't express
 * "staff" — so this stays configuration rather than data until one exists.
 * Empty by default: an unset variable grants nobody anything.
 */
function resolvePlatformAdminIds(): string[] {
  return (process.env.PLATFORM_ADMIN_USER_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

export default registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  apiPrefix: process.env.API_PREFIX || 'api/v1',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3001',
  bcryptRounds: resolveBcryptRounds(),
  maxSessions: parseInt(process.env.MAX_SESSIONS || '5', 10),
  platformAdminIds: resolvePlatformAdminIds(),
}));
