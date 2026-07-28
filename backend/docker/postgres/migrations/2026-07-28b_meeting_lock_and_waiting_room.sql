-- Lock Meeting: host can block any new joins (existing participants keep
-- reconnecting — see MeetingsService.resolveAccess). Additive, safe to
-- re-run.

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false;
