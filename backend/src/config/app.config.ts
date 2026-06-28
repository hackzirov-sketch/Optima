import { registerAs } from '@nestjs/config';

function resolveBcryptRounds(): number {
  const raw = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);
  if (Number.isNaN(raw)) return 12;
  return Math.min(15, Math.max(10, raw));
}

export default registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  apiPrefix: process.env.API_PREFIX || 'api/v1',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3001',
  bcryptRounds: resolveBcryptRounds(),
  maxSessions: parseInt(process.env.MAX_SESSIONS || '5', 10),
}));
