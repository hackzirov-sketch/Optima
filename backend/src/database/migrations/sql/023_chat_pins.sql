-- 023_chat_pins.sql — pinned messages
--
-- chat_messages.is_pinned existed but nothing ever set it. Pinning needs to
-- know when (the pinned bar shows the latest first) and by whom.
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz,
  ADD COLUMN IF NOT EXISTS pinned_by uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_chat_messages_pinned
  ON chat_messages (room_id, pinned_at DESC)
  WHERE is_pinned AND deleted_at IS NULL;
