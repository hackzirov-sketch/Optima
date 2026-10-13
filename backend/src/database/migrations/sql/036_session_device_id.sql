-- 036_session_device_id.sql — the browser install a session belongs to (the
-- app's own X-Device-Id). A new login from the same browser replaces that
-- device's session, so the "active sessions" list shows each device once.
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS device_id varchar(64);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_device
  ON refresh_tokens (user_id, device_id) WHERE revoked_at IS NULL;
-- Sessions minted without any client details (group switches) were piling
-- up as "Browser · Device, IP unknown" duplicates: retire them — all but each
-- person's most recently used one, which may be the session they are in.
UPDATE refresh_tokens rt SET revoked_at = NOW()
 WHERE rt.revoked_at IS NULL AND rt.ip_address IS NULL AND rt.user_agent IS NULL
   AND rt.id <> (
     SELECT newest.id FROM refresh_tokens newest
      WHERE newest.user_id = rt.user_id AND newest.revoked_at IS NULL
      ORDER BY newest.last_used_at DESC NULLS LAST, newest.created_at DESC
      LIMIT 1
   );
