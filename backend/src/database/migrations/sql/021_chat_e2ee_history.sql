-- 021_chat_e2ee_history.sql — room-key history for a member's new devices
--
-- 020 wrapped every room key only for the devices that existed when it was
-- created, so a member who signs in on a new browser could read nothing sent
-- before that. Any member device that holds an old room key may now re-wrap it
-- for a newly added device of a user who *already had* that key — a member's
-- own history follows them to a new device, while someone who joins later
-- still can't read what was said before they joined.
--
-- A re-wrapped key records who wrapped it, since the recipient derives the
-- unwrapping key from the wrapper's device key, not the epoch creator's.

ALTER TABLE chat_room_keys
  ADD COLUMN IF NOT EXISTS wrapped_by_user uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS wrapped_by_device varchar(64);
