-- 002_integrity_and_timestamps.sql — BACKEND_AUDIT.md §1.4, §2.3, §2.6
--
-- Three unrelated-looking but equally mechanical integrity gaps:
--   1. updated_at columns that nothing ever updated
--   2. unique constraints that ignore soft deletes
--   3. chat_rooms.slug uniqueness enforced only in application code

-- ── 1. updated_at triggers ───────────────────────────────────────────────
-- update_updated_at() already exists and is wired to 7 tables; 25 others have
-- the column but no trigger, so their updated_at froze at insert time. Done in
-- a DO block rather than 25 literal statements so the set stays derived from
-- the schema itself.
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_name = 'updated_at'
      AND NOT EXISTS (
        SELECT 1 FROM pg_trigger tr
        WHERE NOT tr.tgisinternal
          AND tr.tgrelid = ('public.' || quote_ident(c.table_name))::regclass
          AND tr.tgname LIKE '%updated_at%'
      )
  LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION update_updated_at()', t, t);
  END LOOP;
END $$;

-- ── 2. Soft-delete-aware uniqueness ──────────────────────────────────────
-- users has deleted_at, but UNIQUE(email)/UNIQUE(username) were unconditional:
-- a deleted account's email could never be reused by anyone, including the
-- original owner re-registering. Partial unique indexes scope the constraint
-- to live rows only.
--
-- Existing duplicates among deleted rows are impossible (the old constraint
-- forbade them), so these builds cannot fail on current data.
--
-- The old constraints carry TypeORM's hashed names (UQ_97672ac8…), which differ
-- per environment — they're located by the column they cover, not by name.
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'users'::regclass
      AND con.contype = 'u'
      AND array_length(con.conkey, 1) = 1
      AND (
        SELECT a.attname FROM pg_attribute a
        WHERE a.attrelid = con.conrelid AND a.attnum = con.conkey[1]
      ) IN ('email', 'username')
  LOOP
    EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_live
  ON users (lower(email)) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username_live
  ON users (lower(username)) WHERE deleted_at IS NULL AND username IS NOT NULL;

-- Lookups by email/username now go through the same lower() expression the
-- index is built on, for both live and deleted rows.
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users (lower(email));

-- ── 3. chat_rooms.slug ───────────────────────────────────────────────────
-- Only system rooms had a unique slug; ordinary groups/channels relied on a
-- SELECT-then-INSERT check in updateRoomSettings, which two concurrent renames
-- can both pass. Case-insensitive because every lookup does lower(slug).
CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_rooms_slug_live
  ON chat_rooms (lower(slug)) WHERE slug IS NOT NULL;
