-- Workspace removal, part 1/2: add the new enum labels the group-promotion
-- migration (017) needs. Postgres will not let a newly added enum value be
-- used in the same transaction that adds it, so this has to be its own
-- migration file (each file = one transaction, see migrations/index.ts).

ALTER TYPE public.projects_visibility_enum ADD VALUE IF NOT EXISTS 'group';
ALTER TYPE public.room_scope_enum ADD VALUE IF NOT EXISTS 'group_only';

-- groups.visibility will reuse the exact same two labels workspaces used, so
-- no new type is needed for it — see 017 which does
-- `ALTER TABLE groups ADD COLUMN visibility public.workspaces_visibility_enum`
-- and then renames the type itself once workspaces is gone.
