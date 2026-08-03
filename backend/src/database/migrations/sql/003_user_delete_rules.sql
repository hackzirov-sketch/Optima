-- 003_user_delete_rules.sql — BACKEND_AUDIT.md §2.2
--
-- 18 foreign keys pointed at users with no ON DELETE rule, so `DELETE FROM
-- users` failed outright. Policy applied here:
--
--   nullable author/actor column  -> ON DELETE SET NULL
--       The row is content or an audit record that must outlive its author;
--       the app already renders a missing author as "deleted user" (see e.g.
--       message.service.ts, which maps a null join result to `sender: null`).
--
--   workspaces.owner_id           -> ON DELETE RESTRICT (explicit)
--       A workspace without an owner is not a valid state. Deleting the owner
--       must be preceded by an ownership transfer; failing loudly is correct.
--
--   NOT NULL author column        -> left alone, deliberately
--       Turning these nullable is a semantic change (every read path assumes
--       an author) and belongs with the "anonymise account" feature, not with
--       a constraint cleanup. Soft delete (users.deleted_at) already covers
--       today's account-removal flow. Tracked in BACKEND_AUDIT.md §2.2.

DO $$
DECLARE
  fk record;
BEGIN
  FOR fk IN
    SELECT c.conname,
           c.conrelid::regclass::text AS tbl,
           a.attname                  AS col
    FROM pg_constraint c
    JOIN unnest(c.conkey) k(attnum) ON true
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
    WHERE c.contype = 'f'
      AND c.confrelid = 'users'::regclass
      AND c.confdeltype IN ('a', 'r')     -- NO ACTION / RESTRICT
      AND array_length(c.conkey, 1) = 1
      AND NOT a.attnotnull                -- nullable only; see policy above
  LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', fk.tbl, fk.conname);
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I)
         REFERENCES users(id) ON DELETE SET NULL',
      fk.tbl, 'fk_' || fk.tbl || '_' || fk.col || '_user', fk.col);
  END LOOP;
END $$;

-- Ownership is the one relationship that must block the delete rather than
-- quietly null out.
DO $$
DECLARE
  cname text;
BEGIN
  SELECT c.conname INTO cname
  FROM pg_constraint c
  JOIN unnest(c.conkey) k(attnum) ON true
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
  WHERE c.contype = 'f' AND c.conrelid = 'workspaces'::regclass
    AND c.confrelid = 'users'::regclass AND a.attname = 'owner_id';

  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE workspaces DROP CONSTRAINT %I', cname);
  END IF;
  ALTER TABLE workspaces
    ADD CONSTRAINT fk_workspaces_owner_user
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT;
END $$;
