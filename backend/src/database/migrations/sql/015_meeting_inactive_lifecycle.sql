-- Google-Meet-style room lifecycle: an empty meeting goes INACTIVE, not
-- ENDED. The link/code stays valid and re-activates the room on the next
-- join; only an explicit "End meeting" (or the retention sweep, added in
-- application code) makes it ENDED for good.
--
-- This value can only be added, not used, inside this migration's own
-- transaction (Postgres restriction on ALTER TYPE ... ADD VALUE) — nothing
-- below references it, application code starts using it on its next deploy.
ALTER TYPE meeting_status_enum ADD VALUE IF NOT EXISTS 'inactive';

-- Explicit activity marker rather than relying on updated_at: meetings has
-- no updated_at trigger (checked docker/postgres/init.sql — most tables do,
-- this one doesn't), and the existing status-change UPDATEs don't set it by
-- hand either. Drives the retention sweep that finally expires a
-- long-abandoned INACTIVE room.
ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS last_activity_at timestamp with time zone NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS "IDX_meetings_status_last_activity"
  ON public.meetings USING btree (status, last_activity_at);
