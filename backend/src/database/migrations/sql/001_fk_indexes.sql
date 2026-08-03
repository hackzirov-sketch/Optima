-- 001_fk_indexes.sql — see BACKEND_AUDIT.md §2.1
--
-- Every single-column foreign key in the schema was unindexed. Two costs:
-- joins scan, and deleting a parent row forces a sequential scan of each
-- child table to enforce the constraint. Generated from pg_constraint, so
-- the list is exhaustive rather than hand-picked.
--
-- Not CONCURRENTLY: the runner wraps each migration in a transaction, and
-- these tables are small enough that a brief lock is cheaper than the
-- bookkeeping of out-of-transaction index builds.

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace_id ON audit_logs (workspace_id);
CREATE INDEX IF NOT EXISTS idx_chat_members_user_id ON chat_members (user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_id ON chat_messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_chat_reactions_user_id ON chat_reactions (user_id);
CREATE INDEX IF NOT EXISTS idx_chat_room_invites_created_by ON chat_room_invites (created_by);
CREATE INDEX IF NOT EXISTS idx_chat_room_slug_history_room_id ON chat_room_slug_history (room_id);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_created_by ON chat_rooms (created_by);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_group_id ON chat_rooms (group_id);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_last_message_id ON chat_rooms (last_message_id);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_linked_room_id ON chat_rooms (linked_room_id);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_project_id ON chat_rooms (project_id);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_workspace_id ON chat_rooms (workspace_id);
CREATE INDEX IF NOT EXISTS idx_developer_daily_stats_project_id ON developer_daily_stats (project_id);
CREATE INDEX IF NOT EXISTS idx_developer_daily_stats_workspace_id ON developer_daily_stats (workspace_id);
CREATE INDEX IF NOT EXISTS idx_developer_project_stats_project_id ON developer_project_stats (project_id);
CREATE INDEX IF NOT EXISTS idx_education_channels_created_by ON education_channels (created_by);
CREATE INDEX IF NOT EXISTS idx_education_notes_video_id ON education_notes (video_id);
CREATE INDEX IF NOT EXISTS idx_education_playlists_channel_id ON education_playlists (channel_id);
CREATE INDEX IF NOT EXISTS idx_education_progress_video_id ON education_progress (video_id);
CREATE INDEX IF NOT EXISTS idx_education_saved_videos_video_id ON education_saved_videos (video_id);
CREATE INDEX IF NOT EXISTS idx_education_video_reports_video_id ON education_video_reports (video_id);
CREATE INDEX IF NOT EXISTS idx_education_videos_channel_id ON education_videos (channel_id);
CREATE INDEX IF NOT EXISTS idx_education_videos_playlist_id ON education_videos (playlist_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members (user_id);
CREATE INDEX IF NOT EXISTS idx_groups_created_by ON groups (created_by);
CREATE INDEX IF NOT EXISTS idx_meeting_join_requests_reviewed_by ON meeting_join_requests (reviewed_by);
CREATE INDEX IF NOT EXISTS idx_meeting_join_requests_user_id ON meeting_join_requests (user_id);
CREATE INDEX IF NOT EXISTS idx_meeting_participants_user_id ON meeting_participants (user_id);
CREATE INDEX IF NOT EXISTS idx_meeting_recordings_started_by ON meeting_recordings (started_by);
CREATE INDEX IF NOT EXISTS idx_meeting_shared_files_shared_by ON meeting_shared_files (shared_by);
CREATE INDEX IF NOT EXISTS idx_message_attachments_message_id ON message_attachments (message_id);
CREATE INDEX IF NOT EXISTS idx_message_attachments_uploader_id ON message_attachments (uploader_id);
CREATE INDEX IF NOT EXISTS idx_message_drafts_room_id ON message_drafts (room_id);
CREATE INDEX IF NOT EXISTS idx_message_threads_room_id ON message_threads (room_id);
CREATE INDEX IF NOT EXISTS idx_notifications_actor_id ON notifications (actor_id);
CREATE INDEX IF NOT EXISTS idx_project_columns_project_id ON project_columns (project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_invited_by ON project_members (invited_by);
CREATE INDEX IF NOT EXISTS idx_projects_created_by ON projects (created_by);
CREATE INDEX IF NOT EXISTS idx_projects_group_id ON projects (group_id);
CREATE INDEX IF NOT EXISTS idx_projects_repository_id ON projects (repository_id);
CREATE INDEX IF NOT EXISTS idx_projects_updated_by ON projects (updated_by);
CREATE INDEX IF NOT EXISTS idx_push_review_comments_author_id ON push_review_comments (author_id);
CREATE INDEX IF NOT EXISTS idx_push_review_comments_parent_id ON push_review_comments (parent_id);
CREATE INDEX IF NOT EXISTS idx_push_review_comments_push_id ON push_review_comments (push_id);
CREATE INDEX IF NOT EXISTS idx_push_review_comments_resolved_by ON push_review_comments (resolved_by);
CREATE INDEX IF NOT EXISTS idx_repositories_workspace_id ON repositories (workspace_id);
CREATE INDEX IF NOT EXISTS idx_tags_created_by ON tags (created_by);
CREATE INDEX IF NOT EXISTS idx_task_activities_task_id ON task_activities (task_id);
CREATE INDEX IF NOT EXISTS idx_task_activities_user_id ON task_activities (user_id);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_created_by ON task_dependencies (created_by);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_depends_on_id ON task_dependencies (depends_on_id);
CREATE INDEX IF NOT EXISTS idx_task_pushes_repository_id ON task_pushes (repository_id);
CREATE INDEX IF NOT EXISTS idx_task_pushes_reviewed_by ON task_pushes (reviewed_by);
CREATE INDEX IF NOT EXISTS idx_task_pushes_task_id ON task_pushes (task_id);
CREATE INDEX IF NOT EXISTS idx_task_pushes_user_id ON task_pushes (user_id);
CREATE INDEX IF NOT EXISTS idx_task_tags_tag_id ON task_tags (tag_id);
CREATE INDEX IF NOT EXISTS idx_task_watchers_user_id ON task_watchers (user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_id ON tasks (assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_column_id ON tasks (column_id);
CREATE INDEX IF NOT EXISTS idx_tasks_creator_id ON tasks (creator_id);
CREATE INDEX IF NOT EXISTS idx_tasks_group_id ON tasks (group_id);
CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id ON tasks (parent_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks (project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_reviewer_id ON tasks (reviewer_id);
CREATE INDEX IF NOT EXISTS idx_user_chat_settings_room_id ON user_chat_settings (room_id);
CREATE INDEX IF NOT EXISTS idx_workspace_github_installations_workspace_id ON workspace_github_installations (workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_invitations_invited_by ON workspace_invitations (invited_by);
CREATE INDEX IF NOT EXISTS idx_workspace_invitations_workspace_id ON workspace_invitations (workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user_id ON workspace_members (user_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_owner_id ON workspaces (owner_id);
