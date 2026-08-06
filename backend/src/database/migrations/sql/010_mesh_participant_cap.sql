-- 010_mesh_participant_cap.sql
--
-- Calls are a full mesh: every participant opens a peer connection to every
-- other one and uploads a separate copy of their video to each. Cost per
-- participant grows with N, and browsers give out somewhere around eight.
--
-- The API accepted up to 500 and defaulted to 100 — about fifteen times what
-- the transport can carry. Rows written under that default still advertise
-- capacity nobody can use, so the UI offers a 100-person meeting that falls
-- apart at nine. join() already clamps to MESH_MAX_PARTICIPANTS at runtime,
-- which is what actually protects a call; this brings the stored numbers in
-- line so the figure shown to a host is the figure they will get.
--
-- Only meetings that haven't finished are touched: a past meeting's row is a
-- record of what was configured at the time, and rewriting history to match a
-- limit introduced later would be a lie about what happened.

UPDATE meetings
   SET max_participants = LEAST(max_participants, 8)
 WHERE max_participants > 8
   AND status NOT IN ('ended', 'cancelled');

-- Defence in depth against a future code path that writes the column directly
-- and skips the DTO. Kept at the mesh limit rather than something looser, so
-- the database refuses what the transport cannot deliver. NOT VALID so the
-- statement doesn't have to re-scan finished meetings, which are intentionally
-- left as they were above.
ALTER TABLE meetings
  DROP CONSTRAINT IF EXISTS chk_meetings_max_participants;

ALTER TABLE meetings
  ADD CONSTRAINT chk_meetings_max_participants
  CHECK (max_participants BETWEEN 2 AND 8) NOT VALID;
