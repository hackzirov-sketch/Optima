-- 020_chat_e2ee.sql — end-to-end encryption for private conversations
--
-- Telegram-style split, decided per room from (type, scope):
--
--   direct (1:1)                      → E2EE, keys live only on user devices
--   group / channel, scope <> public  → E2EE, keys live on member devices
--   group / channel, scope = public   → server-side encryption at rest
--                                       (CHAT_ENCRYPTION_KEY, as before)
--
-- Public rooms are readable by people who are not members, so every reader —
-- the server included, since it can always act as one — would need the key.
-- E2EE cannot hide anything there; they keep the existing at-rest encryption
-- and no per-user keys are generated for them.
--
-- For E2EE rooms the server only stores and relays:
--   * each device's ECDH P-256 *public* key (user_device_keys);
--   * per room "epochs": a random AES-256 room key, wrapped separately for
--     every member device (chat_room_keys). The server never sees it unwrapped;
--   * message ciphertext in chat_messages.content_json (is_e2ee = true).
-- A new epoch is required whenever the set of member devices changes, so a
-- removed member can't read anything sent after they left.

CREATE TABLE IF NOT EXISTS user_device_keys (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id     varchar(64) NOT NULL,
  -- ECDH P-256 public key as a JWK ({kty, crv, x, y}). Never a private key.
  public_key    jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at    timestamptz,
  CONSTRAINT uq_user_device_keys UNIQUE (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_user_device_keys_active
  ON user_device_keys (user_id) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS chat_room_key_epochs (
  room_id            uuid NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  epoch              integer NOT NULL CHECK (epoch > 0),
  created_by         uuid REFERENCES users(id) ON DELETE SET NULL,
  created_by_device  varchar(64) NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, epoch)
);

CREATE TABLE IF NOT EXISTS chat_room_keys (
  room_id      uuid NOT NULL,
  epoch        integer NOT NULL,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id    varchar(64) NOT NULL,
  -- AES-GCM ciphertext (base64) of the 32-byte room key, under a key derived
  -- from ECDH(creator device, this device) + HKDF.
  wrapped_key  text NOT NULL,
  iv           varchar(32) NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, epoch, user_id, device_id),
  FOREIGN KEY (room_id, epoch)
    REFERENCES chat_room_key_epochs (room_id, epoch) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chat_room_keys_device
  ON chat_room_keys (user_id, device_id, room_id);

ALTER TABLE chat_rooms
  ADD COLUMN IF NOT EXISTS e2ee_epoch integer NOT NULL DEFAULT 0;

-- Per message, not per room: a room can move between public and private, and
-- each message must still be rendered the way it was sent.
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS is_e2ee boolean NOT NULL DEFAULT false;
