import { registerAs } from '@nestjs/config';

export default registerAs('github', () => ({
  appId: process.env.GITHUB_APP_ID,
  privateKey: process.env.GITHUB_APP_PRIVATE_KEY,
  webhookSecret: process.env.GITHUB_APP_WEBHOOK_SECRET,
  clientId: process.env.GITHUB_CLIENT_ID,
  clientSecret: process.env.GITHUB_CLIENT_SECRET,
  encryptionKey: process.env.ENCRYPTION_KEY,
  callbackUrl: process.env.GITHUB_CALLBACK_URL || 'http://localhost:5001/api/v1/auth/github/callback',
}));
