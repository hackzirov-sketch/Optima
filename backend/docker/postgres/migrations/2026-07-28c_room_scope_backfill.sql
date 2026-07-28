-- Backfills the `scope` column (and its backing enum) onto chat_rooms and
-- meetings for environments provisioned before the "chat route redesign"
-- feature — the base column/table definitions in init.sql already assume
-- it exists, but init.sql itself only ever runs on a brand-new database, so
-- any environment created earlier never picked this up.
--
-- Backfills workspace_id-aware defaults BEFORE adding the NOT NULL + CHECK
-- constraint, so existing rows (including workspace-less rows, e.g. DMs)
-- can never violate chk_*_scope_workspace on creation. Safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'room_scope_enum') THEN
    CREATE TYPE public.room_scope_enum AS ENUM ('workspace_only', 'private', 'public', 'invite_only');
  END IF;
END$$;

-- ── chat_rooms ────────────────────────────────────────────────────────────
ALTER TABLE public.chat_rooms ADD COLUMN IF NOT EXISTS scope public.room_scope_enum;

UPDATE public.chat_rooms
SET scope = CASE WHEN workspace_id IS NOT NULL THEN 'workspace_only'::public.room_scope_enum
                 ELSE 'public'::public.room_scope_enum END
WHERE scope IS NULL;

ALTER TABLE public.chat_rooms ALTER COLUMN scope SET DEFAULT 'workspace_only'::public.room_scope_enum;
ALTER TABLE public.chat_rooms ALTER COLUMN scope SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_chat_rooms_scope_workspace') THEN
    ALTER TABLE public.chat_rooms
      ADD CONSTRAINT chk_chat_rooms_scope_workspace
      CHECK ((scope <> 'workspace_only'::public.room_scope_enum) OR (workspace_id IS NOT NULL));
  END IF;
END$$;

-- ── meetings ──────────────────────────────────────────────────────────────
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS scope public.room_scope_enum;

UPDATE public.meetings
SET scope = CASE WHEN workspace_id IS NOT NULL THEN 'workspace_only'::public.room_scope_enum
                 ELSE 'public'::public.room_scope_enum END
WHERE scope IS NULL;

ALTER TABLE public.meetings ALTER COLUMN scope SET DEFAULT 'workspace_only'::public.room_scope_enum;
ALTER TABLE public.meetings ALTER COLUMN scope SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_meetings_scope_workspace') THEN
    ALTER TABLE public.meetings
      ADD CONSTRAINT chk_meetings_scope_workspace
      CHECK ((scope <> 'workspace_only'::public.room_scope_enum) OR (workspace_id IS NOT NULL));
  END IF;
END$$;
