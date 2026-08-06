-- 009_unify_audit_log.sql — one audit trail, not two.
--
-- `audit_logs` already existed with an entity, a service and five write sites
-- (workspace delete, role changes, member removal, project delete). Migration
-- 008 then added `channel_settings_audit` beside it for room configuration —
-- a second table answering the same question ("who changed what, when"), with
-- its own shape, its own reader and no way to see both in one place.
--
-- Room configuration moves into the shared table. `audit_logs` already carries
-- everything the room case needs: entity_type/entity_id name the room,
-- old_value/new_value hold the diff, and workspace_id is nullable — which
-- matters, because a channel belongs to its members and not to a workspace.

-- Carry the existing rows over rather than dropping history on the floor.
-- The 008 shape stored a single `changes` object of {field: {from, to}};
-- audit_logs splits that into old_value/new_value, so the diff is rebuilt here.
INSERT INTO audit_logs (workspace_id, actor_id, action, entity_type, entity_id,
                        old_value, new_value, created_at)
SELECT r.workspace_id,
       a.user_id,
       'chat_room.settings_updated',
       'chat_room',
       a.room_id,
       (SELECT jsonb_object_agg(key, value -> 'from')
          FROM jsonb_each(a.changes) WHERE value ? 'from'),
       (SELECT jsonb_object_agg(key, value -> 'to')
          FROM jsonb_each(a.changes) WHERE value ? 'to'),
       a.created_at
  FROM channel_settings_audit a
  JOIN chat_rooms r ON r.id = a.room_id;

DROP TABLE IF EXISTS channel_settings_audit;

-- The read paths this enables: a workspace's activity feed, one entity's
-- history, and "what has this person been doing".
CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace
  ON audit_logs (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
  ON audit_logs (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor
  ON audit_logs (actor_id, created_at DESC);
