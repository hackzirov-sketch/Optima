export const RedisKeys = {
  blacklistToken: (jti: string) => `upz:blacklist:${jti}`,
  userBlock: (userId: string) => `upz:user_blocked:${userId}`,
  oauthCode: (code: string) => `upz:oauth:${code}`,
  pwdReset: (token: string) => `upz:pwd_reset:${token}`,
  rateLimitFailures: (action: string, ip: string) => `upz:rl:fails:${action}:${ip}`,
  rateLimitBlocked: (action: string, ip: string) => `upz:rl:block:${action}:${ip}`,
  accountLockout: (userId: string) => `upz:account_lock:${userId}`,
  accountLockoutFailures: (userId: string) => `upz:account_lock:fails:${userId}`,
  cachedUser: (userId: string) => `upz:user_cache:${userId}`,
};
