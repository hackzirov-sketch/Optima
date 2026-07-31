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
  /** OTP code for password reset — stored separately so we can verify without consuming the reset token. */
  pwdResetOtp: (resetToken: string) => `upz:pwd_reset_otp:${resetToken}`,
  /** Confirmed reset token (after OTP verified) — used to authorize the actual password change. */
  pwdResetConfirmed: (confirmedToken: string) => `upz:pwd_reset_confirmed:${confirmedToken}`,
  rateLimitFailures: (action: string, ip: string) => `upz:rl:fails:${action}:${ip}`,
  rateLimitBlocked: (action: string, ip: string) => `upz:rl:block:${action}:${ip}`,
  /** Per-user chat message send rate limit — one key per tier (burst/medium/long), keyed by userId not IP. */
  chatMsgRate: (tier: string, userId: string) => `upz:chat_rl:${tier}:${userId}`,
  accountLockout: (userId: string) => `upz:account_lock:${userId}`,
  accountLockoutFailures: (userId: string) => `upz:account_lock:fails:${userId}`,
  cachedUser: (userId: string) => `upz:user_cache:${userId}`,
  lastSeen: (userId: string) => `upz:last_seen:${userId}`,
  workspaceMember: (workspaceId: string, userId: string) => `upz:ws_member:${workspaceId}:${userId}`,
  /** Sorted set of userIds waiting for host approval, score = requestedAt epoch ms — fast count/order path for the meeting Waiting Room, mirrors meeting_join_requests (Postgres stays the source of truth). */
  meetingWaiting: (meetingId: string) => `upz:meeting_waiting:${meetingId}`,

  // ── Email verification ───────────────────────────────────────────────────────
  // Keyed by a long, unguessable, globally-unique token — NOT by the 6-digit code.
  // At 100K+ concurrent pending verifications, a 6-digit code (~900K keyspace) has
  // a real collision probability across different users; scoping lookups by token
  // first (then checking the code against that specific record) removes the
  // collision risk entirely regardless of how many users verify concurrently.
  emailVerify: (token: string) => `upz:email_verify:${token}`,
  /** Cooldown between resend requests for a given user (independent of the token). */
  emailVerifyResendCooldown: (userId: string) => `upz:email_verify:resend_cd:${userId}`,
  /** Daily resend cap per user. */
  emailVerifyResendCount: (userId: string) => `upz:email_verify:resend_count:${userId}`,
};
