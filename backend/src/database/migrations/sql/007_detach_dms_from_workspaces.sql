-- 007_detach_dms_from_workspaces.sql — BACKEND_AUDIT.md §2.4
--
-- A direct conversation belongs to the two people in it, never to an
-- organisation. Existing DMs still carry the workspace their creator happened
-- to be in, which is what made a DM invisible to whichever side didn't share
-- that workspace. New DMs are created with workspace_id NULL (see
-- ChatRoomService.createRoom); this brings the old rows in line so listing
-- behaves identically for every conversation.

-- scope moves with it: chk_chat_rooms_scope_workspace requires a workspace for
-- scope 'workspace_only', and a two-person conversation is private by
-- definition — that scope was only ever inherited from the creator's context.
UPDATE chat_rooms SET workspace_id = NULL, scope = 'private'
 WHERE type = 'direct' AND (workspace_id IS NOT NULL OR scope = 'workspace_only');

-- Enforce it, so the invariant can't quietly regress the next time someone
-- adds a create path.
ALTER TABLE chat_rooms DROP CONSTRAINT IF EXISTS chk_direct_rooms_have_no_workspace;
ALTER TABLE chat_rooms ADD CONSTRAINT chk_direct_rooms_have_no_workspace
  CHECK (type <> 'direct' OR workspace_id IS NULL);
