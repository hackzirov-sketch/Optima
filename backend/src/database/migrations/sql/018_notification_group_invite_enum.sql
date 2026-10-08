-- Found via sandbox testing after 017: notifications_type_enum still only
-- had 'workspace_invite', not 'group_invite', so InvitationsService.create
-- failed on every invite ("invalid input value for enum
-- notifications_type_enum"). Two-step for the same reason as 016: a new
-- enum value can't be used in the transaction that adds it.

ALTER TYPE public.notifications_type_enum ADD VALUE IF NOT EXISTS 'group_invite';
