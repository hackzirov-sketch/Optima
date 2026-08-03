-- 005_merge_duplicate_dms.sql — BACKEND_AUDIT.md §1.3
--
-- Folds every duplicated direct room into one per pair, then locks the
-- invariant in with a unique index so it cannot happen again.
--
-- Survivor = the room with the most messages (falling back to the oldest), so
-- the conversation people actually used is the one that remains. Messages from
-- the losing rooms are moved over and re-sequenced by created_at, preserving
-- chronology across the merge. Attachments, reactions and thread rows follow
-- their message by foreign key and need no separate handling.

DO $$
DECLARE
  grp     record;
  loser   record;
  next_seq bigint;
BEGIN
  FOR grp IN
    SELECT pair.key,
           (SELECT m.room_id
              FROM chat_members m
              JOIN chat_rooms cr ON cr.id = m.room_id
              WHERE m.left_at IS NULL AND cr.type = 'direct'
              GROUP BY m.room_id
             HAVING min(m.user_id::text) || ':' || max(m.user_id::text) = pair.key
                AND count(*) = 2
             ORDER BY (SELECT count(*) FROM chat_messages x WHERE x.room_id = m.room_id) DESC,
                      (SELECT cr2.created_at FROM chat_rooms cr2 WHERE cr2.id = m.room_id) ASC
             LIMIT 1) AS keeper
    FROM (
      SELECT min(m.user_id::text) || ':' || max(m.user_id::text) AS key
      FROM chat_members m
      JOIN chat_rooms cr ON cr.id = m.room_id AND cr.type = 'direct'
      WHERE m.left_at IS NULL
      GROUP BY m.room_id
      HAVING count(*) = 2
    ) pair
    GROUP BY pair.key
    HAVING count(*) > 1
  LOOP
    SELECT COALESCE(max(sequence), 0) INTO next_seq
    FROM chat_messages WHERE room_id = grp.keeper;

    FOR loser IN
      SELECT m.room_id AS id
      FROM chat_members m
      JOIN chat_rooms cr ON cr.id = m.room_id AND cr.type = 'direct'
      WHERE m.left_at IS NULL
      GROUP BY m.room_id
      HAVING min(m.user_id::text) || ':' || max(m.user_id::text) = grp.key
         AND count(*) = 2
         AND m.room_id <> grp.keeper
    LOOP
      -- Re-sequence onto the end of the keeper's timeline. Done via a CTE so
      -- every moved message gets a distinct sequence in one statement, which
      -- the (room_id, sequence) unique index requires.
      WITH renumbered AS (
        SELECT id, next_seq + row_number() OVER (ORDER BY created_at, sequence) AS seq
        FROM chat_messages WHERE room_id = loser.id
      )
      UPDATE chat_messages cm
         SET room_id = grp.keeper, sequence = r.seq
        FROM renumbered r
       WHERE cm.id = r.id;

      SELECT COALESCE(max(sequence), 0) INTO next_seq
      FROM chat_messages WHERE room_id = grp.keeper;

      -- Carry over per-user state the loser room held, without clobbering a
      -- row the keeper already has.
      UPDATE message_drafts d SET room_id = grp.keeper
       WHERE d.room_id = loser.id
         AND NOT EXISTS (SELECT 1 FROM message_drafts k
                          WHERE k.room_id = grp.keeper AND k.user_id = d.user_id);
      UPDATE user_chat_settings s SET room_id = grp.keeper
       WHERE s.room_id = loser.id
         AND NOT EXISTS (SELECT 1 FROM user_chat_settings k
                          WHERE k.room_id = grp.keeper AND k.user_id = s.user_id);
      UPDATE message_threads t SET room_id = grp.keeper WHERE t.room_id = loser.id;

      -- Anything still pointing at the loser (members, invites, slug history)
      -- goes with it via ON DELETE CASCADE.
      DELETE FROM chat_rooms WHERE id = loser.id;
    END LOOP;

    -- Rebuild the survivor's denormalised counters.
    UPDATE chat_rooms r
       SET message_seq = COALESCE(next_seq, 0),
           last_message_id = (SELECT id FROM chat_messages
                               WHERE room_id = grp.keeper AND deleted_at IS NULL
                               ORDER BY sequence DESC LIMIT 1),
           last_message_at = (SELECT created_at FROM chat_messages
                               WHERE room_id = grp.keeper AND deleted_at IS NULL
                               ORDER BY sequence DESC LIMIT 1)
     WHERE r.id = grp.keeper;

    -- A member may have read further in the room that lost; clamp everyone to
    -- the merged timeline so unread counts stay sane.
    UPDATE chat_members SET last_read_seq = LEAST(last_read_seq, COALESCE(next_seq, 0))
     WHERE room_id = grp.keeper;

    PERFORM sync_dm_key(grp.keeper);
  END LOOP;
END $$;

-- Fill in any key still missing (rooms skipped by 004's backfill because they
-- were duplicated at the time).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM chat_rooms WHERE type = 'direct' AND dm_key IS NULL
  LOOP
    PERFORM sync_dm_key(r.id);
  END LOOP;
END $$;

-- The invariant, from here on enforced by Postgres rather than by hope.
CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_rooms_dm_pair
  ON chat_rooms (dm_key) WHERE dm_key IS NOT NULL;
