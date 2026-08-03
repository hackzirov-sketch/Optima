import { registerAs } from '@nestjs/config';

function resolveBcryptRounds(): number {
  const raw = parseInt(process.env.BCRYPT_ROUNDS || '10', 10);
  if (Number.isNaN(raw)) return 10;
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
