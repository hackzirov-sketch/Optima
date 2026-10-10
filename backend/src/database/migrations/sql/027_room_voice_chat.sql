-- 027_room_voice_chat.sql — group/channel video chats (Telegram-style)
--
-- A video chat is a meeting attached to a chat room: one live at a time per
-- room, joined from the room's banner by its members.
ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS chat_room_id uuid REFERENCES chat_rooms(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_meetings_chat_room
  ON meetings (chat_room_id, created_at DESC) WHERE chat_room_id IS NOT NULL;
