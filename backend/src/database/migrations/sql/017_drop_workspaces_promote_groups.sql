-- Workspace removal, part 2/2.
--
-- "Group" is promoted to be the sole top-level ownership/tenant container,
-- absorbing everything "workspaces" used to own (owner, visibility, member
-- quotas, invitations, github installs). Every table that used to carry
-- workspace_id is repointed at group_id instead, and the workspaces* tables
-- are dropped.
--
-- Backfill heuristic for rows that only ever had workspace_id (meetings,
-- notes, repositories, tags, earnings, developer_daily_stats, audit_logs):
-- prefer the group under that workspace the row's own actor (host/creator/
-- user/actor) is already a member of; otherwise fall back to that
-- workspace's oldest group. Workspaces with zero groups get a synthetic
-- "General" group created from the workspace's own identity so no row is
-- orphaned. This is a best-effort mapping for real data — reasonable for
-- promoting an existing dev/staging database, but worth a manual spot-check
-- before relying on it in production.

-- 1. Every workspace must have at least one group to donate identity/data to.
--    workspace_id is still NOT NULL on public.groups at this point in the
--    intended history (it's only dropped in step 15, after every dependent
--    table has been backfilled) — but this migration must also tolerate a
--    dev database where the column was already removed by hand, so restore
--    it defensively (nullable; step 15 drops it again either way) before
--    relying on it below.
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS workspace_id uuid;

INSERT INTO public.groups (id, name, slug, type, description, avatar_url, created_by, workspace_id, created_at, updated_at)
SELECT public.uuid_generate_v4(), w.name, w.slug, 'general', w.description, w.avatar_url, w.owner_id, w.id, w.created_at, w.updated_at
FROM public.workspaces w
WHERE NOT EXISTS (SELECT 1 FROM public.groups g WHERE g.workspace_id = w.id)
  AND w.deleted_at IS NULL;

-- 2. Groups absorb workspace identity: owner, visibility, member/project quotas.
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS owner_id uuid,
  ADD COLUMN IF NOT EXISTS visibility public.workspaces_visibility_enum,
  ADD COLUMN IF NOT EXISTS max_members integer,
  ADD COLUMN IF NOT EXISTS max_projects integer;

UPDATE public.groups g
SET owner_id = w.owner_id,
    visibility = w.visibility,
    max_members = w.max_members,
    max_projects = w.max_projects
FROM public.workspaces w
WHERE g.workspace_id = w.id;

-- Any group whose workspace was hard-deleted out from under it (shouldn't
-- happen given the FK, but be defensive) falls back to its own creator.
UPDATE public.groups SET owner_id = created_by WHERE owner_id IS NULL;
UPDATE public.groups SET visibility = 'private' WHERE visibility IS NULL;
UPDATE public.groups SET max_members = 10 WHERE max_members IS NULL;
UPDATE public.groups SET max_projects = 20 WHERE max_projects IS NULL;

ALTER TABLE public.groups
  ALTER COLUMN owner_id SET NOT NULL,
  ALTER COLUMN visibility SET NOT NULL,
  ALTER COLUMN visibility SET DEFAULT 'private',
  ALTER COLUMN max_members SET NOT NULL,
  ALTER COLUMN max_members SET DEFAULT 10,
  ALTER COLUMN max_projects SET NOT NULL,
  ALTER COLUMN max_projects SET DEFAULT 20;

ALTER TABLE public.groups
  ADD CONSTRAINT fk_groups_owner FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- A fast lookup of "the group that represents workspace W" for backfill
-- joins below: oldest group in the workspace wins.
CREATE TEMP TABLE workspace_primary_group AS
SELECT DISTINCT ON (workspace_id) workspace_id, id AS group_id
FROM public.groups
ORDER BY workspace_id, created_at ASC;

-- 3. Workspace-wide members become members of every group under that
--    workspace (workspace membership implied access to all its groups).
INSERT INTO public.group_members (group_id, user_id, role, joined_at)
SELECT g.id, wm.user_id, wm.role::text::public.group_members_role_enum, wm.joined_at
FROM public.workspace_members wm
JOIN public.groups g ON g.workspace_id = wm.workspace_id
ON CONFLICT (group_id, user_id) DO NOTHING;

-- 4. Invitations and GitHub installs move to group-scoped tables.
CREATE TABLE public.group_invitations (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL PRIMARY KEY,
    group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    invited_by uuid NOT NULL,
    email character varying(255) NOT NULL,
    role public.group_members_role_enum DEFAULT 'junior'::public.group_members_role_enum NOT NULL,
    token character varying(64) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    accepted_at timestamp with time zone,
    declined_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX group_invitations_token_key ON public.group_invitations (token);
CREATE INDEX group_invitations_group_id_idx ON public.group_invitations (group_id);

INSERT INTO public.group_invitations (id, group_id, invited_by, email, role, token, expires_at, accepted_at, declined_at, created_at)
SELECT wi.id,
       COALESCE(
         (SELECT g.id FROM public.groups g
          JOIN public.group_members gm ON gm.group_id = g.id AND gm.user_id = wi.invited_by
          WHERE g.workspace_id = wi.workspace_id LIMIT 1),
         (SELECT group_id FROM workspace_primary_group WHERE workspace_id = wi.workspace_id)
       ),
       wi.invited_by, wi.email, wi.role::text::public.group_members_role_enum,
       wi.token, wi.expires_at, wi.accepted_at, wi.declined_at, wi.created_at
FROM public.workspace_invitations wi
WHERE EXISTS (SELECT 1 FROM workspace_primary_group wpg WHERE wpg.workspace_id = wi.workspace_id);

CREATE TABLE public.group_github_installations (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL PRIMARY KEY,
    group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    github_installation_id bigint NOT NULL,
    github_org_name character varying(100),
    github_org_avatar_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX group_github_installations_group_id_idx ON public.group_github_installations (group_id);

INSERT INTO public.group_github_installations (id, group_id, github_installation_id, github_org_name, github_org_avatar_url, created_at, updated_at)
SELECT gi.id, wpg.group_id, gi.github_installation_id, gi.github_org_name, gi.github_org_avatar_url, gi.created_at, gi.updated_at
FROM public.workspace_github_installations gi
JOIN workspace_primary_group wpg ON wpg.workspace_id = gi.workspace_id;

-- 5. projects: workspace_id was redundant with group_id already — just drop
--    it, backfilling any project whose group_id was somehow never set.
UPDATE public.projects p
SET group_id = (SELECT group_id FROM workspace_primary_group WHERE workspace_id = p.workspace_id)
WHERE group_id IS NULL;
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS "FK_af78b8fc6857fe0a10d1bb1699e";
ALTER TABLE public.projects DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE public.projects ALTER COLUMN group_id SET NOT NULL;

-- 6. chat_rooms: same redundancy as projects, plus the scope enum/check and
--    the 'workspace' structural room type collapse into 'group'. group_id
--    stays nullable here — DMs and some channels are never group-scoped.
UPDATE public.chat_rooms c
SET group_id = (SELECT group_id FROM workspace_primary_group WHERE workspace_id = c.workspace_id)
WHERE group_id IS NULL AND workspace_id IS NOT NULL;
UPDATE public.chat_rooms SET scope = 'group_only' WHERE scope = 'workspace_only';
UPDATE public.chat_rooms SET type = 'group' WHERE type = 'workspace';
ALTER TABLE public.chat_rooms DROP CONSTRAINT IF EXISTS chk_chat_rooms_scope_workspace;
ALTER TABLE public.chat_rooms
  ADD CONSTRAINT chk_chat_rooms_scope_group CHECK (((scope <> 'group_only'::public.room_scope_enum) OR (group_id IS NOT NULL)));
ALTER TABLE public.chat_rooms DROP CONSTRAINT IF EXISTS "FK_65b04eb62dcded1647ea9c58797";
ALTER TABLE public.chat_rooms DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE public.chat_rooms ALTER COLUMN scope SET DEFAULT 'group_only';

-- 7. tasks: group_id was already nullable and derivable from the project —
--    backfill, then make it the required scope column.
UPDATE public.tasks t
SET group_id = p.group_id
FROM public.projects p
WHERE t.project_id = p.id AND t.group_id IS NULL;

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS "FK_5cb6ca4667dfa947871694da959";
ALTER TABLE public.tasks DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE public.tasks ALTER COLUMN group_id SET NOT NULL;

-- 8. meetings: add group_id, backfill via host membership else workspace's
--    primary group, keep nullable (standalone/no-group meetings still allowed).
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS group_id uuid;
UPDATE public.meetings m
SET group_id = COALESCE(
  (SELECT gm.group_id FROM public.group_members gm
   JOIN public.groups g ON g.id = gm.group_id
   WHERE gm.user_id = m.host_id AND g.workspace_id = m.workspace_id LIMIT 1),
  (SELECT group_id FROM workspace_primary_group WHERE workspace_id = m.workspace_id)
)
WHERE m.workspace_id IS NOT NULL;

UPDATE public.meetings SET scope = 'group_only' WHERE scope = 'workspace_only';
ALTER TABLE public.meetings DROP CONSTRAINT IF EXISTS chk_meetings_scope_workspace;
ALTER TABLE public.meetings
  ADD CONSTRAINT chk_meetings_scope_group CHECK (((scope <> 'group_only'::public.room_scope_enum) OR (group_id IS NOT NULL)));
ALTER TABLE public.meetings DROP CONSTRAINT IF EXISTS meetings_workspace_id_fkey;
ALTER TABLE public.meetings DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE public.meetings ALTER COLUMN scope SET DEFAULT 'group_only';
ALTER TABLE public.meetings
  ADD CONSTRAINT meetings_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS meetings_group_id_idx ON public.meetings (group_id);

-- 9. notes: add group_id, backfill via creator membership else primary group,
--    stays nullable (a note can be fully personal/global).
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS group_id uuid;
UPDATE public.notes n
SET group_id = COALESCE(
  (SELECT gm.group_id FROM public.group_members gm
   JOIN public.groups g ON g.id = gm.group_id
   WHERE gm.user_id = n.creator_id AND g.workspace_id = n.workspace_id LIMIT 1),
  (SELECT group_id FROM workspace_primary_group WHERE workspace_id = n.workspace_id)
)
WHERE n.workspace_id IS NOT NULL;

ALTER TABLE public.notes DROP CONSTRAINT IF EXISTS "FK_notes_workspace";
ALTER TABLE public.notes DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE public.notes
  ADD CONSTRAINT fk_notes_group FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS notes_group_id_idx ON public.notes (group_id);

-- 10. repositories: required scope, no natural per-row actor — primary group.
ALTER TABLE public.repositories ADD COLUMN IF NOT EXISTS group_id uuid;
UPDATE public.repositories r
SET group_id = (SELECT group_id FROM workspace_primary_group WHERE workspace_id = r.workspace_id)
WHERE group_id IS NULL;
ALTER TABLE public.repositories DROP CONSTRAINT IF EXISTS "FK_ef165ed919cfdafd420660e3186";
ALTER TABLE public.repositories DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE public.repositories ALTER COLUMN group_id SET NOT NULL;
ALTER TABLE public.repositories
  ADD CONSTRAINT fk_repositories_group FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS repositories_group_id_idx ON public.repositories (group_id);

-- 11. tags: backfill via created_by membership else primary group.
ALTER TABLE public.tags ADD COLUMN IF NOT EXISTS group_id uuid;
UPDATE public.tags t
SET group_id = COALESCE(
  (SELECT gm.group_id FROM public.group_members gm
   JOIN public.groups g ON g.id = gm.group_id
   WHERE gm.user_id = t.created_by AND g.workspace_id = t.workspace_id LIMIT 1),
  (SELECT group_id FROM workspace_primary_group WHERE workspace_id = t.workspace_id)
)
WHERE group_id IS NULL;
ALTER TABLE public.tags DROP CONSTRAINT IF EXISTS "FK_3352c57d71fe58f703b8966caee";
ALTER TABLE public.tags DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE public.tags ALTER COLUMN group_id SET NOT NULL;
ALTER TABLE public.tags
  ADD CONSTRAINT fk_tags_group FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS tags_group_id_idx ON public.tags (group_id);

-- 12. earnings: backfill via user_id membership else primary group.
ALTER TABLE public.earnings ADD COLUMN IF NOT EXISTS group_id uuid;
UPDATE public.earnings e
SET group_id = COALESCE(
  (SELECT gm.group_id FROM public.group_members gm
   JOIN public.groups g ON g.id = gm.group_id
   WHERE gm.user_id = e.user_id AND g.workspace_id = e.workspace_id LIMIT 1),
  (SELECT group_id FROM workspace_primary_group WHERE workspace_id = e.workspace_id)
)
WHERE group_id IS NULL;
ALTER TABLE public.earnings DROP CONSTRAINT IF EXISTS earnings_workspace_id_fkey;
ALTER TABLE public.earnings DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE public.earnings ALTER COLUMN group_id SET NOT NULL;
ALTER TABLE public.earnings
  ADD CONSTRAINT fk_earnings_group FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS earnings_group_id_idx ON public.earnings (group_id);

-- 13. developer_daily_stats: backfill via user_id membership else primary group.
ALTER TABLE public.developer_daily_stats ADD COLUMN IF NOT EXISTS group_id uuid;
UPDATE public.developer_daily_stats d
SET group_id = COALESCE(
  (SELECT gm.group_id FROM public.group_members gm
   JOIN public.groups g ON g.id = gm.group_id
   WHERE gm.user_id = d.user_id AND g.workspace_id = d.workspace_id LIMIT 1),
  (SELECT group_id FROM workspace_primary_group WHERE workspace_id = d.workspace_id)
)
WHERE group_id IS NULL;
ALTER TABLE public.developer_daily_stats DROP CONSTRAINT IF EXISTS "FK_21297171e999cfc96ee117fa671";
ALTER TABLE public.developer_daily_stats DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE public.developer_daily_stats ALTER COLUMN group_id SET NOT NULL;
ALTER TABLE public.developer_daily_stats
  ADD CONSTRAINT fk_dev_daily_stats_group FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS developer_daily_stats_group_id_idx ON public.developer_daily_stats (group_id);

-- 14. audit_logs: backfill via actor_id membership else primary group; stays nullable.
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS group_id uuid;
UPDATE public.audit_logs a
SET group_id = COALESCE(
  (SELECT gm.group_id FROM public.group_members gm
   JOIN public.groups g ON g.id = gm.group_id
   WHERE gm.user_id = a.actor_id AND g.workspace_id = a.workspace_id LIMIT 1),
  (SELECT group_id FROM workspace_primary_group WHERE workspace_id = a.workspace_id)
)
WHERE a.workspace_id IS NOT NULL;
ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS "FK_e140f8ddef870ea93925f251f26";
ALTER TABLE public.audit_logs DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE public.audit_logs
  ADD CONSTRAINT fk_audit_logs_group FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS audit_logs_group_id_idx ON public.audit_logs (group_id);

-- 15. groups no longer belongs to a workspace.
ALTER TABLE public.groups DROP CONSTRAINT IF EXISTS "FK_b249fc0de77c1575349389dcf57";
ALTER TABLE public.groups DROP COLUMN IF EXISTS workspace_id;

-- 16. drop the now-empty workspace tables (children first for FK order).
DROP TABLE IF EXISTS public.workspace_invitations;
DROP TABLE IF EXISTS public.workspace_github_installations;
DROP TABLE IF EXISTS public.workspace_members;
DROP TABLE IF EXISTS public.workspaces;

DROP TYPE IF EXISTS public.workspace_invitations_role_enum;
DROP TYPE IF EXISTS public.workspace_members_role_enum;
ALTER TYPE public.workspaces_visibility_enum RENAME TO groups_visibility_enum;

DROP TABLE workspace_primary_group;
