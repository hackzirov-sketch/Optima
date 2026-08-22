-- Companion to 018 — now that 'group_invite' exists on notifications_type_enum,
-- move any existing rows off the old 'workspace_invite' value. Needs its own
-- migration for the same "can't use a value in the transaction that added
-- it" reason as 018.

UPDATE public.notifications SET type = 'group_invite' WHERE type = 'workspace_invite';
