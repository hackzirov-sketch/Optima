-- A user may leave at most one reaction on a message. Keep the newest one
-- when cleaning historical duplicates before adding the database guarantee.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY message_id, user_id
           ORDER BY created_at DESC, id DESC
         ) AS rn
    FROM chat_reactions
)
DELETE FROM chat_reactions r
 USING ranked d
 WHERE r.id = d.id AND d.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_reactions_message_user
  ON chat_reactions (message_id, user_id);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS name_emoji varchar(16);

