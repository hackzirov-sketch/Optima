-- 029_chat_drafts.sql — drafts follow their owner across devices (Telegram).
-- message_drafts held plaintext only; end-to-end encrypted chats now store
-- the draft as an envelope encrypted on the device with the room key, and
-- `content` stays empty for them.
ALTER TABLE message_drafts ADD COLUMN IF NOT EXISTS e2ee jsonb;
