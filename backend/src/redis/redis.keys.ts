export const RedisKeys = {
  // ── Notification ─────────────────────────────────────────────────────────────
  /** Track if a Telegram message was read (for smart SMS suppression) */
  telegramRead: (notifId: string) => `upz:tg_read:${notifId}`,
  /** User notification prefs cache — 5 min TTL */
  notifPrefs: (userId: string) => `upz:notif_prefs:${userId}`,

  blacklistToken: (jti: string) => `upz:blacklist:${jti}`,
  userBlock: (userId: string) => `upz:user_blocked:${userId}`,
  oauthCode: (code: string) => `upz:oauth:${code}`,
  pwdReset: (token: string) => `upz:pwd_reset:${token}`,
  /** OTP code for password reset — stored separately so we can verify without consuming the reset token. */
  pwdResetOtp: (resetToken: string) => `upz:pwd_reset_otp:${resetToken}`,
  /** Confirmed reset token (after OTP verified) — used to authorize the actual password change. */
  pwdResetConfirmed: (confirmedToken: string) =>
    `upz:pwd_reset_confirmed:${confirmedToken}`,
  rateLimitFailures: (action: string, ip: string) =>
    `upz:rl:fails:${action}:${ip}`,
  rateLimitBlocked: (action: string, ip: string) =>
    `upz:rl:block:${action}:${ip}`,
  /** Per-user chat message send rate limit — one key per tier (burst/medium/long), keyed by userId not IP. */
  chatMsgRate: (tier: string, userId: string) =>
    `upz:chat_rl:${tier}:${userId}`,
  accountLockout: (userId: string) => `upz:account_lock:${userId}`,
  accountLockoutFailures: (userId: string) =>
    `upz:account_lock:fails:${userId}`,
  cachedUser: (userId: string) => `upz:user_cache:${userId}`,
  /**
   * Authorization caches. These decide whether a request is allowed, so they
   * hold only the fields that decision needs (id/role/status) — never volatile
   * ones like last_read_seq, which would otherwise evict the entry on every
   * read receipt — and every write to the underlying row must drop them. See
   * MembersService.invalidateMember / ChatMemberService.invalidateRoomMember,
   * which are the only sanctioned way to write these.
   */
  workspaceMember: (workspaceId: string, userId: string) =>
    `upz:ws_member:${workspaceId}:${userId}`,
  roomMember: (roomId: string, userId: string) =>
    `upz:room_member:${roomId}:${userId}`,
  /** Per-room chat settings — read on the send-message hot path. */
  roomSettings: (roomId: string) => `upz:room_settings:${roomId}`,
  /** Unread notification counter, maintained incrementally instead of COUNT(*). */
  notifUnread: (userId: string) => `upz:notif_unread:${userId}`,
  /** Hash of userId -> epoch ms, flushed to users.last_seen in one bulk UPDATE. */
  lastSeenPending: 'upz:last_seen_pending',
  /** Pre-aggregated analytics payloads (workspace overview, project rollups). */
  analytics: (scope: string, id: string) => `upz:analytics:${scope}:${id}`,
  /** Sorted set of userIds waiting for host approval, score = requestedAt epoch ms — fast count/order path for the meeting Waiting Room, mirrors meeting_join_requests (Postgres stays the source of truth). */
  meetingWaiting: (meetingId: string) => `upz:meeting_waiting:${meetingId}`,
  /**
   * Set of userIds with a hand currently raised. Purely ephemeral
   * (session-scoped, like reactions) — this is a visibility signal, not a
   * permission grant, so there is no Postgres table behind it and nothing
   * to review/approve; see MeetingsService.setHandRaised.
   */
  meetingRaisedHands: (meetingId: string) =>
    `upz:meeting_hands:${meetingId}`,

  // ── Email verification ───────────────────────────────────────────────────────
  // Keyed by a long, unguessable, globally-unique token — NOT by the 6-digit code.
  // At 100K+ concurrent pending verifications, a 6-digit code (~900K keyspace) has
  // a real collision probability across different users; scoping lookups by token
  // first (then checking the code against that specific record) removes the
  // collision risk entirely regardless of how many users verify concurrently.
  emailVerify: (token: string) => `upz:email_verify:${token}`,
  /** Cooldown between resend requests for a given user (independent of the token). */
  emailVerifyResendCooldown: (userId: string) =>
    `upz:email_verify:resend_cd:${userId}`,
  /** Daily resend cap per user. */
  emailVerifyResendCount: (userId: string) =>
    `upz:email_verify:resend_count:${userId}`,
};
