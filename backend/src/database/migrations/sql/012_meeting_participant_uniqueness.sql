-- 012_meeting_participant_uniqueness.sql
--
-- One person is in a meeting once, or they are not in it. The table never
-- enforced that: `meeting_participants` had an index on user_id but no unique
-- constraint on (meeting_id, user_id).
--
-- It went unnoticed because join() found any historical row and reused it,
-- which also meant a returning participant skipped the lock and capacity
-- checks entirely — someone who had ever been in a call could rejoin a locked
-- or already-full one. Fixing that check means join() now inserts when the old
-- row is closed, so the constraint has to be real rather than implied by the
-- one code path that happened to maintain it.
--
-- Duplicates are collapsed before the index is built: the row that is still
-- open wins, otherwise the one that most recently joined. Their media flags
-- follow the surviving row, which is the one the client is looking at.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY meeting_id, user_id
           ORDER BY (left_at IS NULL) DESC, joined_at DESC NULLS LAST, created_at DESC
         ) AS rn
    FROM meeting_participants
)
DELETE FROM meeting_participants p
 USING ranked r
 WHERE p.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_meeting_participants_meeting_user
  ON meeting_participants (meeting_id, user_id);
