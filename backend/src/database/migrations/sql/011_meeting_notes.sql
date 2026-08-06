-- 011_meeting_notes.sql
--
-- Notes could be scoped to a workspace, a project or a task. Taking notes
-- during a call — the one moment people most reliably write things down — had
-- nowhere to go, so `notes` gains a fourth scope.
--
-- ON DELETE CASCADE matches how the other scopes behave: a note about a
-- meeting has no meaning once the meeting row is gone, and leaving orphans
-- would put rows in the table that no list query can ever reach.
ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS meeting_id uuid
  REFERENCES meetings(id) ON DELETE CASCADE;

-- Every note list is "the notes for this one thing", so the lookup is by
-- scope column. Partial, because only a small fraction of notes are ever
-- attached to a meeting and there is no reason to index the NULLs.
CREATE INDEX IF NOT EXISTS idx_notes_meeting_id
  ON notes (meeting_id)
  WHERE meeting_id IS NOT NULL;

-- The scopes are alternatives, not layers: a note belongs to a meeting or to
-- the project/task hierarchy, never to both. Enforced here as well as in the
-- DTO so a future code path that writes the table directly cannot produce a
-- row whose scope is ambiguous — which of the two lists would it appear in?
ALTER TABLE notes
  DROP CONSTRAINT IF EXISTS chk_notes_scope_exclusive;

ALTER TABLE notes
  ADD CONSTRAINT chk_notes_scope_exclusive
  CHECK (meeting_id IS NULL OR (project_id IS NULL AND task_id IS NULL))
  NOT VALID;
