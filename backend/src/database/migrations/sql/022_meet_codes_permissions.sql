-- 022_meet_codes_permissions.sql — Meet links, host controls, SFU capacity
--
-- 1. Codes look like Google Meet's: abc-defg-hij (lowercase letters only, no
--    l/o to avoid 1/0 confusion), used in /meet/<code> links. Existing
--    OPTIMA-XXX-XXXX codes are reissued in the new shape; lookups are
--    case-insensitive from now on.
-- 2. Host controls: what non-host participants may do. Enforced by the API
--    (socket gates) and by LiveKit permissions on the SFU path.
-- 3. Capacity: the 8-person cap existed for the browser mesh. Behind the
--    LiveKit SFU a room can hold far more, so the database allows up to 100;
--    the API still clamps to 8 when meetings run peer-to-peer.
-- 4. Meeting notes and shared files are removed from meetings entirely.

-- ── 1. codes ─────────────────────────────────────────────────────────────
UPDATE meetings m
   SET meeting_code = substr(r.s, 1, 3) || '-' || substr(r.s, 4, 4) || '-' || substr(r.s, 8, 3)
  FROM (
    SELECT id,
           (SELECT string_agg(substr('abcdefghijkmnpqrstuvwxyz', 1 + floor(random() * 24)::int, 1), '')
              FROM generate_series(1, 10) AS g
             WHERE g > 0 AND meetings.id IS NOT NULL) AS s
      FROM meetings
     WHERE meeting_code LIKE 'OPTIMA-%'
  ) r
 WHERE m.id = r.id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_meetings_code_ci ON meetings (lower(meeting_code));

-- ── 2. host controls ─────────────────────────────────────────────────────
ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS allow_screen_share boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_reactions    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_microphone   boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_video        boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_chat         boolean NOT NULL DEFAULT true;

-- ── 3. capacity ──────────────────────────────────────────────────────────
ALTER TABLE meetings DROP CONSTRAINT IF EXISTS chk_meetings_max_participants;
ALTER TABLE meetings ADD CONSTRAINT chk_meetings_max_participants
  CHECK (max_participants >= 2 AND max_participants <= 100) NOT VALID;

-- ── 4. notes & files out of meetings ─────────────────────────────────────
DROP TABLE IF EXISTS meeting_shared_files;
DELETE FROM notes WHERE meeting_id IS NOT NULL;
DROP INDEX IF EXISTS idx_notes_meeting_id;
ALTER TABLE notes DROP COLUMN IF EXISTS meeting_id;
