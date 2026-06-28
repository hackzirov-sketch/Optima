export const RedisKeys = {
  blacklistToken: (jti: string) => `upz:blacklist:${jti}`,
  userBlock: (userId: string) => `upz:user_blocked:${userId}`,
  oauthCode: (code: string) => `upz:oauth:${code}`,
  pwdReset: (token: string) => `upz:pwd_reset:${token}`,
};
