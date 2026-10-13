-- 037_admin_blocks.sql — Optima admin panel.
--
-- Blocking never deletes: an account's is_active goes false and the block is
-- recorded (who, when, why); a group/channel becomes unusable until unblocked.
-- Every admin action lands in admin_audit, which the app never deletes from.
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_reason text;
ALTER TABLE chat_rooms ADD COLUMN IF NOT EXISTS blocked_at timestamptz;
ALTER TABLE chat_rooms ADD COLUMN IF NOT EXISTS blocked_reason text;

CREATE TABLE IF NOT EXISTS admin_audit (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  action       varchar(60) NOT NULL,
  target_type  varchar(20) NOT NULL,
  target_id    uuid,
  details      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit (created_at DESC);
