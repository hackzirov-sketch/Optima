-- 033_chat_join_requests.sql — "ask to join" for private groups/channels.
--
-- An invite link to a private room (or any room with join approval on) no
-- longer lets the holder straight in: it files a request here, and an admin
-- approves or declines it. Kept out of chat_members on purpose — a requester
-- must not show up in member lists, counts, presence or the room list.
CREATE TABLE IF NOT EXISTS chat_join_requests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     uuid NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invite_id   uuid REFERENCES chat_room_invites(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_chat_join_requests_room ON chat_join_requests (room_id, created_at);
