import { registerAs } from '@nestjs/config';

export const envConfig = registerAs('env', () => ({
  isProduction: process.env.NODE_ENV === 'production',
  isDevelopment: process.env.NODE_ENV === 'development',
  isTest: process.env.NODE_ENV === 'test',
}));
