-- Meeting Join Policy: adds INVITE_ONLY visibility + AUTO/REQUEST_APPROVAL
-- join policy for meetings, plus a meeting_join_requests table (waiting
-- room / accept-reject flow). Additive only — does not touch existing
-- chat_rooms rows or behavior (room_scope_enum is shared with chat, but
-- 'invite_only' is a new value nothing currently reads/writes).
--
-- Safe to run multiple times (all statements are guarded).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'room_scope_enum' AND e.enumlabel = 'invite_only'
  ) THEN
    ALTER TYPE public.room_scope_enum ADD VALUE 'invite_only';
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'meeting_join_policy_enum') THEN
    CREATE TYPE public.meeting_join_policy_enum AS ENUM (
      'auto',
      'request_approval'
    );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'meeting_join_request_status_enum') THEN
    CREATE TYPE public.meeting_join_request_status_enum AS ENUM (
      'pending',
      'approved',
      'rejected',
      'cancelled'
    );
  END IF;
END$$;

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS join_policy public.meeting_join_policy_enum
    NOT NULL DEFAULT 'auto';

CREATE TABLE IF NOT EXISTS public.meeting_join_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status public.meeting_join_request_status_enum NOT NULL DEFAULT 'pending',
  requested_at timestamp with time zone DEFAULT now() NOT NULL,
  reviewed_by uuid REFERENCES public.users(id),
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT uq_meeting_join_requests_meeting_user UNIQUE (meeting_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_meeting_join_requests_meeting_status
  ON public.meeting_join_requests (meeting_id, status);
