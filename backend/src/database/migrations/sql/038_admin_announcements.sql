-- 038_admin_announcements.sql — Optima admins can send an announcement
-- (to everyone or one person); it arrives as an in-app notification.
ALTER TYPE notifications_type_enum ADD VALUE IF NOT EXISTS 'announcement';
