-- 032_room_creator_owner.sql — a room's creator who is still a member but
-- only holds 'member' (the workspace #general room was seeded that way) is
-- its owner: they could not edit the room they made. Only rooms with no
-- other owner are touched, so a completed ownership transfer stays put.
UPDATE chat_members m
   SET role = 'owner'
  FROM chat_rooms r
 WHERE r.id = m.room_id
   AND m.user_id = r.created_by
   AND m.left_at IS NULL
   AND m.role = 'member'
   AND NOT EXISTS (
     SELECT 1 FROM chat_members o
      WHERE o.room_id = m.room_id AND o.role = 'owner' AND o.left_at IS NULL
   );
