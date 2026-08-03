import { SetMetadata } from '@nestjs/common';
import {
  AuthRateLimitOptions,
  AUTH_RATE_LIMIT_KEY,
} from '../guards/auth-rate-limit.guard';

export const AuthRateLimit = (options: AuthRateLimitOptions) =>
  SetMetadata(AUTH_RATE_LIMIT_KEY, options);
