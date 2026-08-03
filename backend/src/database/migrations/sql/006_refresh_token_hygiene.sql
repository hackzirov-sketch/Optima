-- 006_refresh_token_hygiene.sql — BACKEND_AUDIT.md §2.5
--
-- Nothing ever removed expired or revoked refresh tokens, so the table only
-- ever grew. One-off cleanup here; ongoing pruning happens per-user in
-- SessionService.persistRefreshToken, on a path that is already writing.

DELETE FROM refresh_tokens
 WHERE expires_at < now() - interval '7 days'
    OR (revoked_at IS NOT NULL AND revoked_at < now() - interval '30 days');

-- Supports both the prune above and the "my active sessions" listing, which
-- filters by user and liveness.
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_expiry
  ON refresh_tokens (user_id, expires_at)
  WHERE revoked_at IS NULL;
