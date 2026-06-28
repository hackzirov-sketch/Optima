export const RedisKeys = {
  // ── Notification ─────────────────────────────────────────────────────────────
  /** Track if a Telegram message was read (for smart SMS suppression) */
  telegramRead: (notifId: string) => `upz:tg_read:${notifId}`,
  /** Reminder job deduplication — prevents double scheduling */
  reminderScheduled: (entityId: string, type: string) => `upz:reminder:sched:${entityId}:${type}`,
  /** User notification prefs cache — 5 min TTL */
  notifPrefs: (userId: string) => `upz:notif_prefs:${userId}`,
  /** Quiet hours bypass tracking */
  quietBypass: (userId: string, notifId: string) => `upz:quiet_bypass:${userId}:${notifId}`,

  blacklistToken: (jti: string) => `upz:blacklist:${jti}`,
  userBlock: (userId: string) => `upz:user_blocked:${userId}`,
  oauthCode: (code: string) => `upz:oauth:${code}`,
  pwdReset: (token: string) => `upz:pwd_reset:${token}`,
  rateLimitFailures: (action: string, ip: string) => `upz:rl:fails:${action}:${ip}`,
  rateLimitBlocked: (action: string, ip: string) => `upz:rl:block:${action}:${ip}`,
  accountLockout: (userId: string) => `upz:account_lock:${userId}`,
  accountLockoutFailures: (userId: string) => `upz:account_lock:fails:${userId}`,
  cachedUser: (userId: string) => `upz:user_cache:${userId}`,
  lastSeen: (userId: string) => `upz:last_seen:${userId}`,
  workspaceMember: (workspaceId: string, userId: string) => `upz:ws_member:${workspaceId}:${userId}`,
};
