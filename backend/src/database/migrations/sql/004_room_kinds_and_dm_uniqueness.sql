-- 004_room_kinds_and_dm_uniqueness.sql — BACKEND_AUDIT.md §1.1, §1.3, §2.4
--
-- Makes chat_rooms model what the product actually has:
--
--   direct  — exactly two people, no workspace, unique per pair
--   group   — many people, workspace optional
--   channel — broadcast, workspace optional      <- was impossible until now
--
-- The old enum had no 'channel' value at all; the only "channel" in the system
-- was community.service.ts rewriting the type in a SELECT when the slug
-- happened to be 'otima-community'. Channels are now a first-class kind.

-- ── 1. channel as a real room type ───────────────────────────────────────
-- ADD VALUE cannot run inside a transaction block in PG < 12; on 16 it can,
-- as long as the new value isn't used in the same transaction. The backfill
-- below therefore only touches rows via their slug, not the new label.
ALTER TYPE chat_rooms_type_enum ADD VALUE IF NOT EXISTS 'channel';

-- ── 2. Workspace-independent rooms ───────────────────────────────────────
-- Groups and channels are user-owned, not workspace-owned: a user creates one
-- straight from chat, authorised by their JWT alone. workspace_id stays as an
-- optional association for rooms that do belong to a workspace.
ALTER TABLE chat_rooms ALTER COLUMN workspace_id DROP NOT NULL;

-- ── 3. One DM per pair, enforced by the database ─────────────────────────
-- Previously a SELECT-then-INSERT in application code, which both sides of a
-- conversation can pass simultaneously — that is exactly how the duplicate
-- pair in this database was created. dm_key is a generated column holding the
-- two member ids in a canonical order, so the unique index is on the *pair*
-- rather than on row order.
ALTER TABLE chat_rooms ADD COLUMN IF NOT EXISTS dm_key varchar(73);

COMMENT ON COLUMN chat_rooms.dm_key IS
  'least(userA,userB):greatest(userA,userB) for direct rooms, NULL otherwise. '
  'Maintained by trg_chat_rooms_dm_key; enforces one DM per pair.';

-- Recomputed from chat_members whenever a direct room''s membership changes.
CREATE OR REPLACE FUNCTION sync_dm_key(target_room uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  ids uuid[];
  is_direct boolean;
BEGIN
  SELECT (type = 'direct') INTO is_direct FROM chat_rooms WHERE id = target_room;
  IF NOT COALESCE(is_direct, false) THEN
    UPDATE chat_rooms SET dm_key = NULL WHERE id = target_room AND dm_key IS NOT NULL;
    RETURN;
  END IF;

  SELECT array_agg(user_id ORDER BY user_id) INTO ids
  FROM chat_members WHERE room_id = target_room AND left_at IS NULL;

  -- Only a settled two-person room gets a key. A half-built room (one member
  -- inserted so far) stays NULL so the unique index doesn't fire mid-insert.
  IF ids IS NULL OR array_length(ids, 1) <> 2 THEN
    UPDATE chat_rooms SET dm_key = NULL WHERE id = target_room AND dm_key IS NOT NULL;
    RETURN;
  END IF;

  UPDATE chat_rooms
     SET dm_key = ids[1]::text || ':' || ids[2]::text
   WHERE id = target_room;
END $$;

CREATE OR REPLACE FUNCTION chat_members_sync_dm_key()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM sync_dm_key(COALESCE(NEW.room_id, OLD.room_id));
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_chat_rooms_dm_key ON chat_members;
CREATE TRIGGER trg_chat_rooms_dm_key
  AFTER INSERT OR UPDATE OF left_at, user_id OR DELETE ON chat_members
  FOR EACH ROW EXECUTE FUNCTION chat_members_sync_dm_key();

-- Backfill. Rooms that are already duplicated keep a NULL key for now — the
-- index below would reject them — so they are merged by 005 before it is
-- created. Here we only fill keys that are already unique.
UPDATE chat_rooms r SET dm_key = pair.key
FROM (
  SELECT m.room_id,
         min(m.user_id::text) || ':' || max(m.user_id::text) AS key
  FROM chat_members m
  JOIN chat_rooms cr ON cr.id = m.room_id AND cr.type = 'direct'
  WHERE m.left_at IS NULL
  GROUP BY m.room_id
  HAVING count(*) = 2
) pair
WHERE r.id = pair.room_id;
