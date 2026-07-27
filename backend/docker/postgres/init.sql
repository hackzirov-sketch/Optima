--
-- PostgreSQL database dump
--


-- Dumped from database version 16.14
-- Dumped by pg_dump version 16.14

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: chat_members_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.chat_members_status_enum AS ENUM (
    'pending',
    'active'
);


--
-- Name: chat_rooms_type_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.chat_rooms_type_enum AS ENUM (
    'public',
    'private',
    'workspace',
    'project',
    'group',
    'direct'
);


--
-- Name: group_members_role_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.group_members_role_enum AS ENUM (
    'owner',
    'admin',
    'lead',
    'senior',
    'middle',
    'junior',
    'guest'
);


--
-- Name: groups_type_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.groups_type_enum AS ENUM (
    'general',
    'development',
    'design',
    'marketing',
    'management',
    'qa',
    'devops',
    'hr',
    'product'
);


--
-- Name: meeting_participant_role_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.meeting_participant_role_enum AS ENUM (
    'host',
    'co_host',
    'participant'
);


--
-- Name: meeting_recordings_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.meeting_recordings_status_enum AS ENUM (
    'recording',
    'completed',
    'failed',
    'cancelled'
);


--
-- Name: meeting_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.meeting_status_enum AS ENUM (
    'scheduled',
    'live',
    'ended',
    'cancelled'
);


--
-- Name: notification_channel_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notification_channel_enum AS ENUM (
    'in_app',
    'email',
    'telegram',
    'sms'
);


--
-- Name: notifications_type_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notifications_type_enum AS ENUM (
    'task_assigned',
    'task_updated',
    'task_commented',
    'push_submitted',
    'push_approved',
    'push_rejected',
    'pr_created',
    'pr_reviewed',
    'pr_merged',
    'project_created',
    'project_updated',
    'member_joined',
    'member_role_changed',
    'mention',
    'workspace_invite',
    'task_completed',
    'task_status_changed',
    'project_member_invite',
    'project_member_accepted',
    'project_member_declined',
    'meeting_invite',
    'chat_invite',
    'chat_invite_accepted',
    'chat_invite_declined'
);


--
-- Name: project_columns_maps_to_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.project_columns_maps_to_status_enum AS ENUM (
    'backlog',
    'todo',
    'in_progress',
    'review',
    'testing',
    'done',
    'blocked',
    'cancelled'
);


--
-- Name: projects_priority_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.projects_priority_enum AS ENUM (
    'critical',
    'high',
    'medium',
    'low'
);


--
-- Name: projects_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.projects_status_enum AS ENUM (
    'planning',
    'active',
    'on_hold',
    'completed',
    'archived',
    'cancelled'
);


--
-- Name: projects_visibility_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.projects_visibility_enum AS ENUM (
    'public',
    'workspace',
    'private'
);


--
-- Name: room_scope_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.room_scope_enum AS ENUM (
    'workspace_only',
    'private',
    'public'
);


--
-- Name: task_dependencies_type_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.task_dependencies_type_enum AS ENUM (
    'blocks',
    'blocked_by',
    'relates_to',
    'duplicates'
);


--
-- Name: task_pushes_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.task_pushes_status_enum AS ENUM (
    'pending',
    'uploaded',
    'approved',
    'rejected',
    'expired',
    'cancelled',
    'merged'
);


--
-- Name: task_pushes_type_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.task_pushes_type_enum AS ENUM (
    'github_direct',
    'upz_review',
    'draft'
);


--
-- Name: tasks_priority_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tasks_priority_enum AS ENUM (
    'critical',
    'high',
    'medium',
    'low'
);


--
-- Name: tasks_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tasks_status_enum AS ENUM (
    'backlog',
    'todo',
    'in_progress',
    'review',
    'testing',
    'done',
    'blocked',
    'cancelled'
);


--
-- Name: tasks_type_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tasks_type_enum AS ENUM (
    'feature',
    'bug',
    'improvement',
    'research',
    'design',
    'hotfix'
);


--
-- Name: users_language_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.users_language_enum AS ENUM (
    'uz',
    'ru',
    'en'
);


--
-- Name: users_theme_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.users_theme_enum AS ENUM (
    'light',
    'dark',
    'system'
);


--
-- Name: workspace_invitations_role_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.workspace_invitations_role_enum AS ENUM (
    'owner',
    'admin',
    'lead',
    'senior',
    'middle',
    'junior',
    'guest'
);


--
-- Name: workspace_members_role_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.workspace_members_role_enum AS ENUM (
    'owner',
    'admin',
    'lead',
    'senior',
    'middle',
    'junior',
    'guest'
);


--
-- Name: workspaces_visibility_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.workspaces_visibility_enum AS ENUM (
    'public',
    'private'
);


--
-- Name: assign_task_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_task_number() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
            BEGIN
              INSERT INTO task_sequences (project_id, last_number)
              VALUES (NEW.project_id, 1)
              ON CONFLICT (project_id) DO UPDATE
                SET last_number = task_sequences.last_number + 1;

              SELECT last_number INTO NEW.task_number
              FROM task_sequences
              WHERE project_id = NEW.project_id;

              RETURN NEW;
            END;
            $$;


--
-- Name: recalculate_project_progress(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recalculate_project_progress() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
            DECLARE
              v_total INT;
              v_done  INT;
            BEGIN
              SELECT
                COUNT(*) FILTER (WHERE deleted_at IS NULL AND parent_task_id IS NULL),
                COUNT(*) FILTER (WHERE deleted_at IS NULL AND parent_task_id IS NULL AND status = 'done')
              INTO v_total, v_done
              FROM tasks
              WHERE project_id = COALESCE(NEW.project_id, OLD.project_id);

              UPDATE projects
              SET progress = CASE WHEN v_total = 0 THEN 0 ELSE (v_done * 100 / v_total) END
              WHERE id = COALESCE(NEW.project_id, OLD.project_id);

              RETURN NEW;
            END;
            $$;


--
-- Name: update_room_last_message(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_room_last_message() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
            BEGIN
              UPDATE chat_rooms
              SET last_message_id = NEW.id, last_message_at = NEW.created_at
              WHERE id = NEW.room_id;
              RETURN NEW;
            END;
            $$;


--
-- Name: update_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
            BEGIN
              NEW.updated_at = NOW();
              RETURN NEW;
            END;
            $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    workspace_id uuid,
    actor_id uuid,
    action character varying(100) NOT NULL,
    entity_type character varying(50),
    entity_id uuid,
    old_value jsonb,
    new_value jsonb,
    ip_address inet,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: banned_content; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.banned_content (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pattern text NOT NULL,
    type character varying(50) DEFAULT 'text'::character varying NOT NULL,
    category character varying(100),
    severity character varying(20) DEFAULT 'medium'::character varying NOT NULL,
    is_regex boolean DEFAULT false NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: chat_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_members (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    room_id uuid NOT NULL,
    user_id uuid NOT NULL,
    is_muted boolean DEFAULT false NOT NULL,
    muted_until timestamp with time zone,
    last_read_at timestamp with time zone,
    last_read_message_id character varying,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    left_at timestamp with time zone,
    last_read_seq integer DEFAULT 0 NOT NULL,
    status public.chat_members_status_enum DEFAULT 'active'::public.chat_members_status_enum NOT NULL
);


--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_messages (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    room_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    reply_to_id uuid,
    content text,
    content_type character varying(20) DEFAULT 'text'::character varying NOT NULL,
    is_edited boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone,
    is_system boolean DEFAULT false NOT NULL,
    system_metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    sequence integer,
    client_message_id character varying(64),
    metadata jsonb,
    content_json jsonb,
    edited_at timestamp with time zone
);


--
-- Name: chat_reactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_reactions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    message_id uuid NOT NULL,
    user_id uuid NOT NULL,
    emoji character varying(10) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: chat_room_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_room_invites (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    room_id uuid NOT NULL,
    created_by uuid NOT NULL,
    code character varying(8) NOT NULL,
    max_uses integer,
    uses_count integer DEFAULT 0 NOT NULL,
    expires_at timestamp with time zone,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: chat_rooms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_rooms (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    workspace_id uuid,
    group_id uuid,
    project_id uuid,
    name character varying(200),
    avatar_url text,
    description text,
    is_archived boolean DEFAULT false NOT NULL,
    is_read_only boolean DEFAULT false NOT NULL,
    last_message_id uuid,
    last_message_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    message_seq integer DEFAULT 0 NOT NULL,
    is_public boolean DEFAULT false NOT NULL,
    invite_code character varying(32),
    type public.chat_rooms_type_enum DEFAULT 'group'::public.chat_rooms_type_enum NOT NULL,
    scope public.room_scope_enum DEFAULT 'workspace_only'::public.room_scope_enum NOT NULL,
    CONSTRAINT chk_chat_rooms_scope_workspace CHECK (((scope <> 'workspace_only'::public.room_scope_enum) OR (workspace_id IS NOT NULL)))
);


--
-- Name: developer_daily_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.developer_daily_stats (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    project_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    date date NOT NULL,
    commits_count integer DEFAULT 0 NOT NULL,
    tasks_completed integer DEFAULT 0 NOT NULL,
    pushes_submitted integer DEFAULT 0 NOT NULL,
    pushes_approved integer DEFAULT 0 NOT NULL,
    added_lines integer DEFAULT 0 NOT NULL,
    removed_lines integer DEFAULT 0 NOT NULL,
    active_minutes integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: developer_project_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.developer_project_stats (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    project_id uuid NOT NULL,
    commits_count integer DEFAULT 0 NOT NULL,
    pushes_count integer DEFAULT 0 NOT NULL,
    approved_pushes integer DEFAULT 0 NOT NULL,
    rejected_pushes integer DEFAULT 0 NOT NULL,
    tasks_completed integer DEFAULT 0 NOT NULL,
    tasks_in_progress integer DEFAULT 0 NOT NULL,
    added_lines bigint DEFAULT '0'::bigint NOT NULL,
    removed_lines bigint DEFAULT '0'::bigint NOT NULL,
    review_score numeric(3,2) DEFAULT '0'::numeric NOT NULL,
    review_count integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: earnings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.earnings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    amount numeric(12,2) NOT NULL,
    currency character varying(3) DEFAULT 'USD'::character varying NOT NULL,
    description text,
    date date NOT NULL,
    source_type character varying(50),
    source_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: github_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.github_accounts (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    github_user_id bigint NOT NULL,
    username character varying(100) NOT NULL,
    avatar_url text,
    email character varying(255),
    access_token_encrypted text NOT NULL,
    refresh_token_encrypted text,
    token_expires_at timestamp with time zone,
    connected_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: group_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_members (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    group_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role public.group_members_role_enum DEFAULT 'junior'::public.group_members_role_enum NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.groups (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    workspace_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    slug character varying(100) NOT NULL,
    type public.groups_type_enum DEFAULT 'general'::public.groups_type_enum NOT NULL,
    description text,
    avatar_url text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by uuid
);


--
-- Name: ip_rate_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ip_rate_limits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ip character varying(45) NOT NULL,
    action_type character varying(100) NOT NULL,
    count integer DEFAULT 1 NOT NULL,
    window_start timestamp with time zone NOT NULL,
    blocked_until timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: meeting_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meeting_participants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    meeting_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role public.meeting_participant_role_enum DEFAULT 'participant'::public.meeting_participant_role_enum NOT NULL,
    joined_at timestamp with time zone,
    left_at timestamp with time zone,
    is_muted boolean DEFAULT false NOT NULL,
    camera_enabled boolean DEFAULT true NOT NULL,
    screen_sharing boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: meeting_recordings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meeting_recordings (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    meeting_id uuid NOT NULL,
    started_by uuid NOT NULL,
    status public.meeting_recordings_status_enum DEFAULT 'recording'::public.meeting_recordings_status_enum NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    stopped_at timestamp with time zone,
    duration_seconds integer,
    auto_stopped boolean DEFAULT false NOT NULL,
    storage_key text,
    storage_url text,
    file_size bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: meetings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meetings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid,
    host_id uuid NOT NULL,
    title character varying(200) NOT NULL,
    description text,
    meeting_code character varying(20) NOT NULL,
    status public.meeting_status_enum DEFAULT 'scheduled'::public.meeting_status_enum NOT NULL,
    start_time timestamp with time zone NOT NULL,
    end_time timestamp with time zone,
    max_participants integer DEFAULT 100 NOT NULL,
    is_recurring boolean DEFAULT false NOT NULL,
    agenda text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    scope public.room_scope_enum DEFAULT 'workspace_only'::public.room_scope_enum NOT NULL,
    CONSTRAINT chk_meetings_scope_workspace CHECK (((scope <> 'workspace_only'::public.room_scope_enum) OR (workspace_id IS NOT NULL)))
);


--
-- Name: message_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_attachments (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    message_id uuid NOT NULL,
    uploader_id uuid NOT NULL,
    file_name character varying(500) NOT NULL,
    file_size bigint NOT NULL,
    mime_type character varying(100) NOT NULL,
    storage_key text NOT NULL,
    storage_url text NOT NULL,
    width integer,
    height integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notes (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    workspace_id uuid,
    project_id uuid,
    task_id uuid,
    creator_id uuid NOT NULL,
    title character varying(200) NOT NULL,
    content text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by uuid
);


--
-- Name: notification_delivery_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_delivery_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    notification_id uuid,
    user_id uuid NOT NULL,
    channel public.notification_channel_enum NOT NULL,
    is_success boolean DEFAULT false NOT NULL,
    error_message text,
    external_id character varying(255),
    is_read_on_channel boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    actor_id uuid,
    type public.notifications_type_enum NOT NULL,
    title character varying(255) NOT NULL,
    message text,
    entity_type character varying(50),
    entity_id uuid,
    metadata jsonb,
    is_read boolean DEFAULT false NOT NULL,
    read_at timestamp with time zone,
    action_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: project_columns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_columns (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    project_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    color character varying(7),
    "position" smallint DEFAULT '0'::smallint NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    maps_to_status public.project_columns_maps_to_status_enum,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: project_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_members (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    project_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role character varying(20) DEFAULT 'member'::character varying NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    invited_by uuid,
    invited_at timestamp with time zone DEFAULT now() NOT NULL,
    joined_at timestamp with time zone
);


--
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    workspace_id uuid NOT NULL,
    group_id uuid,
    repository_id uuid,
    name character varying(200) NOT NULL,
    slug character varying(200) NOT NULL,
    description text,
    cover_url text,
    status public.projects_status_enum DEFAULT 'planning'::public.projects_status_enum NOT NULL,
    priority public.projects_priority_enum DEFAULT 'medium'::public.projects_priority_enum NOT NULL,
    progress smallint DEFAULT '0'::smallint NOT NULL,
    start_date date,
    deadline date,
    completed_at timestamp with time zone,
    created_by uuid NOT NULL,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by uuid,
    visibility public.projects_visibility_enum DEFAULT 'workspace'::public.projects_visibility_enum NOT NULL
);


--
-- Name: push_review_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_review_comments (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    push_id uuid NOT NULL,
    author_id uuid NOT NULL,
    parent_id uuid,
    content text NOT NULL,
    file_path character varying(500),
    line_number integer,
    line_type character varying(10),
    is_resolved boolean DEFAULT false NOT NULL,
    resolved_by uuid,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refresh_tokens (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    token_hash character varying(64) NOT NULL,
    device_info jsonb,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    device_name character varying(200),
    ip_address character varying(45),
    location character varying(100),
    user_agent text,
    last_used_at timestamp with time zone,
    provider character varying(50)
);


--
-- Name: repositories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.repositories (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    workspace_id uuid NOT NULL,
    github_repo_id bigint NOT NULL,
    name character varying(255) NOT NULL,
    full_name character varying(255) NOT NULL,
    description text,
    private boolean DEFAULT false NOT NULL,
    default_branch character varying(100) DEFAULT 'main'::character varying NOT NULL,
    clone_url text,
    html_url text,
    require_review boolean DEFAULT true NOT NULL,
    protected_branches text[] DEFAULT '{main,master,develop}'::text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tags (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    workspace_id uuid NOT NULL,
    name character varying(50) NOT NULL,
    color character varying(7) DEFAULT '#6B7280'::character varying NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: task_activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_activities (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    task_id uuid NOT NULL,
    user_id uuid NOT NULL,
    type character varying(50) NOT NULL,
    description text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: task_dependencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_dependencies (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    task_id uuid NOT NULL,
    depends_on_id uuid NOT NULL,
    type public.task_dependencies_type_enum DEFAULT 'blocks'::public.task_dependencies_type_enum NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "CHK_0e0c6bd4f6d7d53c81375930d5" CHECK ((task_id <> depends_on_id))
);


--
-- Name: task_pushes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_pushes (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    task_id uuid NOT NULL,
    user_id uuid NOT NULL,
    repository_id uuid,
    branch_name character varying(255) NOT NULL,
    type public.task_pushes_type_enum DEFAULT 'upz_review'::public.task_pushes_type_enum NOT NULL,
    status public.task_pushes_status_enum DEFAULT 'pending'::public.task_pushes_status_enum NOT NULL,
    commit_message text NOT NULL,
    commit_sha character varying(40),
    commits_count integer DEFAULT 1 NOT NULL,
    files_changed integer,
    added_lines integer,
    removed_lines integer,
    storage_provider character varying(20) DEFAULT 'r2'::character varying NOT NULL,
    storage_url text,
    storage_key text,
    github_commit_sha character varying(40),
    github_pr_url text,
    github_pr_number integer,
    expires_at timestamp with time zone,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    rejected_reason text,
    cli_version character varying(20),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: task_sequences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_sequences (
    project_id uuid NOT NULL,
    last_number integer DEFAULT 0 NOT NULL
);


--
-- Name: task_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_tags (
    task_id uuid NOT NULL,
    tag_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: task_watchers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_watchers (
    task_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tasks (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    workspace_id uuid NOT NULL,
    project_id uuid NOT NULL,
    group_id uuid,
    column_id uuid,
    parent_task_id uuid,
    task_number integer NOT NULL,
    creator_id uuid NOT NULL,
    assignee_id uuid,
    reviewer_id uuid,
    title character varying(500) NOT NULL,
    description text,
    type public.tasks_type_enum DEFAULT 'feature'::public.tasks_type_enum NOT NULL,
    priority public.tasks_priority_enum DEFAULT 'medium'::public.tasks_priority_enum NOT NULL,
    status public.tasks_status_enum DEFAULT 'backlog'::public.tasks_status_enum NOT NULL,
    story_points smallint,
    estimated_hours numeric(6,2),
    spent_hours numeric(6,2) DEFAULT '0'::numeric NOT NULL,
    start_date date,
    due_date date,
    completed_at timestamp with time zone,
    github_pr_number integer,
    github_pr_url text,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by uuid,
    started_at timestamp with time zone,
    completion_note text,
    is_accepted boolean,
    accepted_at timestamp with time zone,
    declined_at timestamp with time zone,
    decline_reason text
);


--
-- Name: user_ip_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_ip_logs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    ip_address character varying(45) NOT NULL,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    provider character varying(50)
);


--
-- Name: user_notification_prefs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_notification_prefs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    telegram_chat_id bigint,
    phone_verified boolean DEFAULT false NOT NULL,
    meeting_sms boolean DEFAULT true NOT NULL,
    meeting_telegram boolean DEFAULT true NOT NULL,
    meeting_email boolean DEFAULT true NOT NULL,
    meeting_in_app boolean DEFAULT true NOT NULL,
    task_sms boolean DEFAULT false NOT NULL,
    task_telegram boolean DEFAULT true NOT NULL,
    task_email boolean DEFAULT false NOT NULL,
    task_in_app boolean DEFAULT true NOT NULL,
    homework_sms boolean DEFAULT false NOT NULL,
    homework_telegram boolean DEFAULT true NOT NULL,
    homework_email boolean DEFAULT false NOT NULL,
    homework_in_app boolean DEFAULT true NOT NULL,
    payment_sms boolean DEFAULT true NOT NULL,
    payment_telegram boolean DEFAULT true NOT NULL,
    payment_email boolean DEFAULT true NOT NULL,
    payment_in_app boolean DEFAULT true NOT NULL,
    security_sms boolean DEFAULT true NOT NULL,
    security_telegram boolean DEFAULT true NOT NULL,
    security_email boolean DEFAULT true NOT NULL,
    security_in_app boolean DEFAULT true NOT NULL,
    course_telegram boolean DEFAULT true NOT NULL,
    course_in_app boolean DEFAULT true NOT NULL,
    marketing_telegram boolean DEFAULT false NOT NULL,
    marketing_email boolean DEFAULT false NOT NULL,
    marketing_in_app boolean DEFAULT true NOT NULL,
    certificate_telegram boolean DEFAULT true NOT NULL,
    certificate_email boolean DEFAULT true NOT NULL,
    certificate_in_app boolean DEFAULT true NOT NULL,
    quiet_start character varying(5),
    quiet_end character varying(5),
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_settings (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    notifications_enabled boolean DEFAULT true NOT NULL,
    email_notifications boolean DEFAULT true NOT NULL,
    push_notifications boolean DEFAULT true NOT NULL,
    notify_task_assigned boolean DEFAULT true NOT NULL,
    notify_push_reviewed boolean DEFAULT true NOT NULL,
    notify_pr_events boolean DEFAULT true NOT NULL,
    notify_mentions boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_verifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_verifications (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    code character varying(6) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_violations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_violations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type character varying(100) NOT NULL,
    count integer DEFAULT 1 NOT NULL,
    blocked_until timestamp with time zone,
    is_permanent boolean DEFAULT false NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    username character varying(50) NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying,
    avatar_url text,
    language public.users_language_enum DEFAULT 'en'::public.users_language_enum NOT NULL,
    timezone character varying(50) DEFAULT 'UTC'::character varying NOT NULL,
    theme public.users_theme_enum DEFAULT 'system'::public.users_theme_enum NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    is_verified boolean DEFAULT false NOT NULL,
    last_seen timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by uuid,
    first_name character varying(50) NOT NULL,
    last_name character varying(50) NOT NULL,
    phone_number bigint,
    providers text DEFAULT 'local'::text NOT NULL,
    needs_password_setup boolean DEFAULT false NOT NULL,
    occupation character varying(255)
);


--
-- Name: workspace_github_installations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_github_installations (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    workspace_id uuid NOT NULL,
    github_installation_id bigint NOT NULL,
    github_org_name character varying(100),
    github_org_avatar_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: workspace_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_invitations (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    workspace_id uuid NOT NULL,
    invited_by uuid NOT NULL,
    email character varying(255) NOT NULL,
    role public.workspace_invitations_role_enum DEFAULT 'junior'::public.workspace_invitations_role_enum NOT NULL,
    token character varying(64) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    accepted_at timestamp with time zone,
    declined_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: workspace_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_members (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role public.workspace_members_role_enum DEFAULT 'junior'::public.workspace_members_role_enum NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: workspaces; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspaces (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    owner_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    slug character varying(100) NOT NULL,
    description text,
    avatar_url text,
    visibility public.workspaces_visibility_enum DEFAULT 'private'::public.workspaces_visibility_enum NOT NULL,
    max_members integer DEFAULT 10 NOT NULL,
    max_projects integer DEFAULT 20 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by uuid
);


--
-- Name: user_settings PK_00f004f5922a0744d174530d639; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT "PK_00f004f5922a0744d174530d639" PRIMARY KEY (id);


--
-- Name: github_accounts PK_01b75d48868462b91c920cc80dc; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.github_accounts
    ADD CONSTRAINT "PK_01b75d48868462b91c920cc80dc" PRIMARY KEY (id);


--
-- Name: workspaces PK_098656ae401f3e1a4586f47fd8e; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT "PK_098656ae401f3e1a4586f47fd8e" PRIMARY KEY (id);


--
-- Name: audit_logs PK_1bb179d048bbc581caa3b013439; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY (id);


--
-- Name: workspace_members PK_22ab43ac5865cd62769121d2bc4; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT "PK_22ab43ac5865cd62769121d2bc4" PRIMARY KEY (id);


--
-- Name: push_review_comments PK_319279858bc97cc163a543ca5f3; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_review_comments
    ADD CONSTRAINT "PK_319279858bc97cc163a543ca5f3" PRIMARY KEY (id);


--
-- Name: user_verifications PK_3269a92433d028916ab342b94fb; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_verifications
    ADD CONSTRAINT "PK_3269a92433d028916ab342b94fb" PRIMARY KEY (id);


--
-- Name: chat_messages PK_40c55ee0e571e268b0d3cd37d10; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT "PK_40c55ee0e571e268b0d3cd37d10" PRIMARY KEY (id);


--
-- Name: workspace_invitations PK_525b9069dc828a8ee8fdc62c32c; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_invitations
    ADD CONSTRAINT "PK_525b9069dc828a8ee8fdc62c32c" PRIMARY KEY (id);


--
-- Name: developer_project_stats PK_5aeb956cea7b8f483d30582168d; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.developer_project_stats
    ADD CONSTRAINT "PK_5aeb956cea7b8f483d30582168d" PRIMARY KEY (id);


--
-- Name: user_ip_logs PK_600336ac6f0f0e9760207458001; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_ip_logs
    ADD CONSTRAINT "PK_600336ac6f0f0e9760207458001" PRIMARY KEY (id);


--
-- Name: projects PK_6271df0a7aed1d6c0691ce6ac50; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT "PK_6271df0a7aed1d6c0691ce6ac50" PRIMARY KEY (id);


--
-- Name: groups PK_659d1483316afb28afd3a90646e; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT "PK_659d1483316afb28afd3a90646e" PRIMARY KEY (id);


--
-- Name: notifications PK_6a72c3c0f683f6462415e653c3a; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY (id);


--
-- Name: task_pushes PK_701dc63f0930aa0cc6b698884ec; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_pushes
    ADD CONSTRAINT "PK_701dc63f0930aa0cc6b698884ec" PRIMARY KEY (id);


--
-- Name: refresh_tokens PK_7d8bee0204106019488c4c50ffa; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT "PK_7d8bee0204106019488c4c50ffa" PRIMARY KEY (id);


--
-- Name: group_members PK_86446139b2c96bfd0f3b8638852; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT "PK_86446139b2c96bfd0f3b8638852" PRIMARY KEY (id);


--
-- Name: tasks PK_8d12ff38fcc62aaba2cab748772; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT "PK_8d12ff38fcc62aaba2cab748772" PRIMARY KEY (id);


--
-- Name: users PK_a3ffb1c0c8416b9fc6f907b7433; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY (id);


--
-- Name: task_sequences PK_a4c920b990ff41497ae98f832f1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_sequences
    ADD CONSTRAINT "PK_a4c920b990ff41497ae98f832f1" PRIMARY KEY (project_id);


--
-- Name: task_tags PK_a7354e3c3f630636f6e4a29694a; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_tags
    ADD CONSTRAINT "PK_a7354e3c3f630636f6e4a29694a" PRIMARY KEY (task_id, tag_id);


--
-- Name: task_watchers PK_a9ea28114ca0842fe549b67e5d4; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_watchers
    ADD CONSTRAINT "PK_a9ea28114ca0842fe549b67e5d4" PRIMARY KEY (task_id, user_id);


--
-- Name: chat_members PK_aea646f59c92c47af5804ce73a7; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_members
    ADD CONSTRAINT "PK_aea646f59c92c47af5804ce73a7" PRIMARY KEY (id);


--
-- Name: developer_daily_stats PK_aef0dd72eb43cdfcf5fd57a365d; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.developer_daily_stats
    ADD CONSTRAINT "PK_aef0dd72eb43cdfcf5fd57a365d" PRIMARY KEY (id);


--
-- Name: chat_reactions PK_b7996d25cac88b0b98dd010f34a; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_reactions
    ADD CONSTRAINT "PK_b7996d25cac88b0b98dd010f34a" PRIMARY KEY (id);


--
-- Name: task_activities PK_b7b39b92ce3a5cd42cf81a0dd3a; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_activities
    ADD CONSTRAINT "PK_b7b39b92ce3a5cd42cf81a0dd3a" PRIMARY KEY (id);


--
-- Name: banned_content PK_banned_content; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banned_content
    ADD CONSTRAINT "PK_banned_content" PRIMARY KEY (id);


--
-- Name: chat_rooms PK_c69082bd83bffeb71b0f455bd59; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_rooms
    ADD CONSTRAINT "PK_c69082bd83bffeb71b0f455bd59" PRIMARY KEY (id);


--
-- Name: chat_room_invites PK_chat_room_invites; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_room_invites
    ADD CONSTRAINT "PK_chat_room_invites" PRIMARY KEY (id);


--
-- Name: project_columns PK_e1807cd19be86e3e762fe74b94d; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_columns
    ADD CONSTRAINT "PK_e1807cd19be86e3e762fe74b94d" PRIMARY KEY (id);


--
-- Name: task_dependencies PK_e31de0e173af595a21c4ec8e48b; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_dependencies
    ADD CONSTRAINT "PK_e31de0e173af595a21c4ec8e48b" PRIMARY KEY (id);


--
-- Name: message_attachments PK_e5085d973567c61e9306f10f95b; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_attachments
    ADD CONSTRAINT "PK_e5085d973567c61e9306f10f95b" PRIMARY KEY (id);


--
-- Name: tags PK_e7dc17249a1148a1970748eda99; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT "PK_e7dc17249a1148a1970748eda99" PRIMARY KEY (id);


--
-- Name: earnings PK_earnings; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.earnings
    ADD CONSTRAINT "PK_earnings" PRIMARY KEY (id);


--
-- Name: workspace_github_installations PK_eba234a5ec52f761bc0d45c24be; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_github_installations
    ADD CONSTRAINT "PK_eba234a5ec52f761bc0d45c24be" PRIMARY KEY (id);


--
-- Name: repositories PK_ef0c358c04b4f4d29b8ca68ddff; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repositories
    ADD CONSTRAINT "PK_ef0c358c04b4f4d29b8ca68ddff" PRIMARY KEY (id);


--
-- Name: ip_rate_limits PK_ip_rate_limits; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ip_rate_limits
    ADD CONSTRAINT "PK_ip_rate_limits" PRIMARY KEY (id);


--
-- Name: meeting_participants PK_meeting_participants; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_participants
    ADD CONSTRAINT "PK_meeting_participants" PRIMARY KEY (id);


--
-- Name: meeting_recordings PK_meeting_recordings; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_recordings
    ADD CONSTRAINT "PK_meeting_recordings" PRIMARY KEY (id);


--
-- Name: meetings PK_meetings; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT "PK_meetings" PRIMARY KEY (id);


--
-- Name: notes PK_notes; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT "PK_notes" PRIMARY KEY (id);


--
-- Name: project_members PK_project_members; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_members
    ADD CONSTRAINT "PK_project_members" PRIMARY KEY (id);


--
-- Name: user_violations PK_user_violations; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_violations
    ADD CONSTRAINT "PK_user_violations" PRIMARY KEY (id);


--
-- Name: github_accounts REL_2abe4d09959ff963e5489f345d; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.github_accounts
    ADD CONSTRAINT "REL_2abe4d09959ff963e5489f345d" UNIQUE (user_id);


--
-- Name: user_settings REL_4ed056b9344e6f7d8d46ec4b30; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT "REL_4ed056b9344e6f7d8d46ec4b30" UNIQUE (user_id);


--
-- Name: repositories UQ_1737947e7f09f3968cb93720f67; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repositories
    ADD CONSTRAINT "UQ_1737947e7f09f3968cb93720f67" UNIQUE (github_repo_id);


--
-- Name: groups UQ_3cc6a6aeafe6fa3c99428193f89; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT "UQ_3cc6a6aeafe6fa3c99428193f89" UNIQUE (workspace_id, slug);


--
-- Name: workspace_members UQ_4896b609c71ca5ad20ad662077b; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT "UQ_4896b609c71ca5ad20ad662077b" UNIQUE (workspace_id, user_id);


--
-- Name: chat_reactions UQ_4aaf2f987600d88bae0eb5ed5d1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_reactions
    ADD CONSTRAINT "UQ_4aaf2f987600d88bae0eb5ed5d1" UNIQUE (message_id, user_id, emoji);


--
-- Name: workspace_github_installations UQ_4eaac55b049c122a50ccdc04a70; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_github_installations
    ADD CONSTRAINT "UQ_4eaac55b049c122a50ccdc04a70" UNIQUE (github_installation_id);


--
-- Name: task_dependencies UQ_696863e0c061d8b0969bba905af; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_dependencies
    ADD CONSTRAINT "UQ_696863e0c061d8b0969bba905af" UNIQUE (task_id, depends_on_id);


--
-- Name: github_accounts UQ_706b85c143ca9fce6b0d2109b3e; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.github_accounts
    ADD CONSTRAINT "UQ_706b85c143ca9fce6b0d2109b3e" UNIQUE (github_user_id);


--
-- Name: projects UQ_7eb9b48ce9e7d09c360b8550cb2; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT "UQ_7eb9b48ce9e7d09c360b8550cb2" UNIQUE (workspace_id, slug);


--
-- Name: tags UQ_9314fe33e6d22aad5125f05b77e; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT "UQ_9314fe33e6d22aad5125f05b77e" UNIQUE (workspace_id, name);


--
-- Name: users UQ_97672ac88f789774dd47f7c8be3; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE (email);


--
-- Name: refresh_tokens UQ_a7838d2ba25be1342091b6695f1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT "UQ_a7838d2ba25be1342091b6695f1" UNIQUE (token_hash);


--
-- Name: workspaces UQ_b8e9fe62e93d60089dfc4f175f3; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT "UQ_b8e9fe62e93d60089dfc4f175f3" UNIQUE (slug);


--
-- Name: chat_room_invites UQ_chat_room_invites_code; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_room_invites
    ADD CONSTRAINT "UQ_chat_room_invites_code" UNIQUE (code);


--
-- Name: developer_project_stats UQ_de67c7cd65a549fd732a9c68e32; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.developer_project_stats
    ADD CONSTRAINT "UQ_de67c7cd65a549fd732a9c68e32" UNIQUE (user_id, project_id);


--
-- Name: chat_members UQ_e39d387723c54d4a33efe00a3d4; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_members
    ADD CONSTRAINT "UQ_e39d387723c54d4a33efe00a3d4" UNIQUE (room_id, user_id);


--
-- Name: workspace_invitations UQ_efb7ba588916737f408a72a3cc9; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_invitations
    ADD CONSTRAINT "UQ_efb7ba588916737f408a72a3cc9" UNIQUE (token);


--
-- Name: developer_daily_stats UQ_f45144a510d520ad289705311cb; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.developer_daily_stats
    ADD CONSTRAINT "UQ_f45144a510d520ad289705311cb" UNIQUE (user_id, project_id, date);


--
-- Name: group_members UQ_f5939ee0ad233ad35e03f5c65c1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT "UQ_f5939ee0ad233ad35e03f5c65c1" UNIQUE (group_id, user_id);


--
-- Name: users UQ_fe0bb3f6520ee0469504521e710; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "UQ_fe0bb3f6520ee0469504521e710" UNIQUE (username);


--
-- Name: meeting_participants UQ_meeting_participants_meeting_user; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_participants
    ADD CONSTRAINT "UQ_meeting_participants_meeting_user" UNIQUE (meeting_id, user_id);


--
-- Name: project_members UQ_project_members_project_user; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_members
    ADD CONSTRAINT "UQ_project_members_project_user" UNIQUE (project_id, user_id);


--
-- Name: meetings meetings_meeting_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT meetings_meeting_code_key UNIQUE (meeting_code);


--
-- Name: notification_delivery_logs notification_delivery_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_delivery_logs
    ADD CONSTRAINT notification_delivery_logs_pkey PRIMARY KEY (id);


--
-- Name: user_notification_prefs user_notification_prefs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notification_prefs
    ADD CONSTRAINT user_notification_prefs_pkey PRIMARY KEY (id);


--
-- Name: user_notification_prefs user_notification_prefs_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notification_prefs
    ADD CONSTRAINT user_notification_prefs_user_id_key UNIQUE (user_id);


--
-- Name: IDX_2c6a037273f1cb3e6fdd832db2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_2c6a037273f1cb3e6fdd832db2" ON public.user_verifications USING btree (user_id);


--
-- Name: IDX_46d19cf514d5c46a1f15598cf1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_46d19cf514d5c46a1f15598cf1" ON public.chat_messages USING btree (reply_to_id);


--
-- Name: IDX_4c869ade23e6e8bab6df7acaed; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_4c869ade23e6e8bab6df7acaed" ON public.chat_messages USING btree (room_id, sequence);


--
-- Name: IDX_4cdd51bfd9b9d5c3509c8522ce; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_4cdd51bfd9b9d5c3509c8522ce" ON public.chat_messages USING btree (room_id, sender_id, client_message_id) WHERE (client_message_id IS NOT NULL);


--
-- Name: IDX_af08fad7c04bb85403970afdc1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_af08fad7c04bb85403970afdc1" ON public.notifications USING btree (user_id, is_read);


--
-- Name: IDX_banned_content_active_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_banned_content_active_type" ON public.banned_content USING btree (active, type);


--
-- Name: IDX_c86aeab3489909040377e37cf2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_c86aeab3489909040377e37cf2" ON public.tasks USING btree (workspace_id, project_id, deleted_at);


--
-- Name: IDX_earnings_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_earnings_user_id" ON public.earnings USING btree (user_id);


--
-- Name: IDX_earnings_workspace_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_earnings_workspace_date" ON public.earnings USING btree (workspace_id, date);


--
-- Name: IDX_f17d339f7eba1d1d1488829453; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_f17d339f7eba1d1d1488829453" ON public.user_ip_logs USING btree (user_id);


--
-- Name: IDX_meeting_participants_meeting_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_meeting_participants_meeting_id" ON public.meeting_participants USING btree (meeting_id);


--
-- Name: IDX_meeting_recordings_meeting_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_meeting_recordings_meeting_id" ON public.meeting_recordings USING btree (meeting_id);


--
-- Name: IDX_meeting_recordings_one_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IDX_meeting_recordings_one_active" ON public.meeting_recordings USING btree (meeting_id) WHERE (status = 'recording'::public.meeting_recordings_status_enum);


--
-- Name: IDX_meetings_host_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_meetings_host_id" ON public.meetings USING btree (host_id);


--
-- Name: IDX_meetings_workspace_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_meetings_workspace_id" ON public.meetings USING btree (workspace_id);


--
-- Name: IDX_notes_creator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_notes_creator" ON public.notes USING btree (creator_id);


--
-- Name: IDX_notes_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_notes_project" ON public.notes USING btree (project_id);


--
-- Name: IDX_notes_task; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_notes_task" ON public.notes USING btree (task_id);


--
-- Name: IDX_notes_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_notes_workspace" ON public.notes USING btree (workspace_id);


--
-- Name: IDX_notif_delivery_notif_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_notif_delivery_notif_id" ON public.notification_delivery_logs USING btree (notification_id);


--
-- Name: IDX_notif_delivery_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_notif_delivery_user_created" ON public.notification_delivery_logs USING btree (user_id, created_at DESC);


--
-- Name: IDX_user_violations_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_user_violations_user_id" ON public.user_violations USING btree (user_id);


--
-- Name: UQ_chat_rooms_invite_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "UQ_chat_rooms_invite_code" ON public.chat_rooms USING btree (invite_code);


--
-- Name: UQ_ip_rate_limits_ip_action; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "UQ_ip_rate_limits_ip_action" ON public.ip_rate_limits USING btree (ip, action_type);


--
-- Name: idx_chat_room_invites_code_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_room_invites_code_active ON public.chat_room_invites USING btree (code) WHERE (revoked_at IS NULL);


--
-- Name: idx_chat_room_invites_room_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_room_invites_room_id ON public.chat_room_invites USING btree (room_id);


--
-- Name: idx_messages_room; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_room ON public.chat_messages USING btree (room_id, created_at) WHERE (deleted_at IS NULL);


--
-- Name: idx_project_members_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_members_project_id ON public.project_members USING btree (project_id);


--
-- Name: idx_project_members_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_members_user_id ON public.project_members USING btree (user_id);


--
-- Name: idx_refresh_tokens_active_sessions; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refresh_tokens_active_sessions ON public.refresh_tokens USING btree (user_id, created_at) WHERE (revoked_at IS NULL);


--
-- Name: idx_refresh_tokens_token_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refresh_tokens_token_hash ON public.refresh_tokens USING btree (token_hash);


--
-- Name: idx_refresh_tokens_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refresh_tokens_user_id ON public.refresh_tokens USING btree (user_id);


--
-- Name: idx_users_email_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_email_active ON public.users USING btree (email) WHERE ((deleted_at IS NULL) AND (is_active = true));


--
-- Name: chat_messages trg_chat_messages_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_chat_messages_updated_at BEFORE UPDATE ON public.chat_messages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: chat_rooms trg_chat_rooms_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_chat_rooms_updated_at BEFORE UPDATE ON public.chat_rooms FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: projects trg_projects_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: chat_messages trg_room_last_message; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_room_last_message AFTER INSERT ON public.chat_messages FOR EACH ROW EXECUTE FUNCTION public.update_room_last_message();


--
-- Name: tasks trg_task_number; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_task_number BEFORE INSERT ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.assign_task_number();


--
-- Name: tasks trg_task_progress; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_task_progress AFTER INSERT OR DELETE OR UPDATE OF status ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.recalculate_project_progress();


--
-- Name: task_pushes trg_task_pushes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_task_pushes_updated_at BEFORE UPDATE ON public.task_pushes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: tasks trg_tasks_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: users trg_users_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: workspaces trg_workspaces_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_workspaces_updated_at BEFORE UPDATE ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: task_dependencies FK_00047fb689d1f72366034f138f7; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_dependencies
    ADD CONSTRAINT "FK_00047fb689d1f72366034f138f7" FOREIGN KEY (depends_on_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: chat_rooms FK_0ab506d5205f68799f59438ea6a; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_rooms
    ADD CONSTRAINT "FK_0ab506d5205f68799f59438ea6a" FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: chat_reactions FK_11f9bf8d7f071cfa85b4181bf94; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_reactions
    ADD CONSTRAINT "FK_11f9bf8d7f071cfa85b4181bf94" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: audit_logs FK_177183f29f438c488b5e8510cdb; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT "FK_177183f29f438c488b5e8510cdb" FOREIGN KEY (actor_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: task_dependencies FK_1ae6688b1bd90fffe857f4cb707; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_dependencies
    ADD CONSTRAINT "FK_1ae6688b1bd90fffe857f4cb707" FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: tasks FK_1dbcd3d4fce55be91b78cbd7843; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT "FK_1dbcd3d4fce55be91b78cbd7843" FOREIGN KEY (reviewer_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: group_members FK_20a555b299f75843aa53ff8b0ee; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT "FK_20a555b299f75843aa53ff8b0ee" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: notifications FK_20f8b51fd9655c0b69feed5efc6; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT "FK_20f8b51fd9655c0b69feed5efc6" FOREIGN KEY (actor_id) REFERENCES public.users(id);


--
-- Name: developer_daily_stats FK_21297171e999cfc96ee117fa671; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.developer_daily_stats
    ADD CONSTRAINT "FK_21297171e999cfc96ee117fa671" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: projects FK_245208245032c81872d80b8ce4b; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT "FK_245208245032c81872d80b8ce4b" FOREIGN KEY (repository_id) REFERENCES public.repositories(id) ON DELETE SET NULL;


--
-- Name: push_review_comments FK_2670e64be1f7e128c682c96a616; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_review_comments
    ADD CONSTRAINT "FK_2670e64be1f7e128c682c96a616" FOREIGN KEY (author_id) REFERENCES public.users(id);


--
-- Name: github_accounts FK_2abe4d09959ff963e5489f345da; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.github_accounts
    ADD CONSTRAINT "FK_2abe4d09959ff963e5489f345da" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: developer_project_stats FK_2ace807a54b4be291a268ef74f1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.developer_project_stats
    ADD CONSTRAINT "FK_2ace807a54b4be291a268ef74f1" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_verifications FK_2c6a037273f1cb3e6fdd832db24; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_verifications
    ADD CONSTRAINT "FK_2c6a037273f1cb3e6fdd832db24" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: group_members FK_2c840df5db52dc6b4a1b0b69c6e; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT "FK_2c840df5db52dc6b4a1b0b69c6e" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: tags FK_32f027a90ce9c91c9b8ff830d22; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT "FK_32f027a90ce9c91c9b8ff830d22" FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: tags FK_3352c57d71fe58f703b8966caee; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT "FK_3352c57d71fe58f703b8966caee" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: workspaces FK_3bc45ecdd8fdc2108bb92516dde; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT "FK_3bc45ecdd8fdc2108bb92516dde" FOREIGN KEY (owner_id) REFERENCES public.users(id);


--
-- Name: refresh_tokens FK_3ddc983c5f7bcf132fd8732c3f4; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT "FK_3ddc983c5f7bcf132fd8732c3f4" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: message_attachments FK_4014c2d4cd60256ed3b7fb33690; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_attachments
    ADD CONSTRAINT "FK_4014c2d4cd60256ed3b7fb33690" FOREIGN KEY (uploader_id) REFERENCES public.users(id);


--
-- Name: tasks FK_438e3c81c9f4209c13483661157; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT "FK_438e3c81c9f4209c13483661157" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE SET NULL;


--
-- Name: projects FK_458ce18ebdb792c80257bc96678; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT "FK_458ce18ebdb792c80257bc96678" FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: chat_messages FK_46d19cf514d5c46a1f15598cf1c; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT "FK_46d19cf514d5c46a1f15598cf1c" FOREIGN KEY (reply_to_id) REFERENCES public.chat_messages(id) ON DELETE SET NULL;


--
-- Name: task_dependencies FK_4a251b37965df3adc13d3f37ddb; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_dependencies
    ADD CONSTRAINT "FK_4a251b37965df3adc13d3f37ddb" FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: task_pushes FK_4a5a17546667671d2c7652c4c99; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_pushes
    ADD CONSTRAINT "FK_4a5a17546667671d2c7652c4c99" FOREIGN KEY (repository_id) REFERENCES public.repositories(id) ON DELETE CASCADE;


--
-- Name: workspace_members FK_4a7c584ddfe855379598b5e20fd; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT "FK_4a7c584ddfe855379598b5e20fd" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: workspace_members FK_4e83431119fa585fc7aa8b817db; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT "FK_4e83431119fa585fc7aa8b817db" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_settings FK_4ed056b9344e6f7d8d46ec4b302; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT "FK_4ed056b9344e6f7d8d46ec4b302" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: tasks FK_54fc42a253a8338488ec1f960ad; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT "FK_54fc42a253a8338488ec1f960ad" FOREIGN KEY (parent_task_id) REFERENCES public.tasks(id) ON DELETE SET NULL;


--
-- Name: chat_rooms FK_5701562e820039704a4d1d3e79d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_rooms
    ADD CONSTRAINT "FK_5701562e820039704a4d1d3e79d" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE SET NULL;


--
-- Name: developer_daily_stats FK_58a6f1229e51f5bd15bf5552726; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.developer_daily_stats
    ADD CONSTRAINT "FK_58a6f1229e51f5bd15bf5552726" FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: tasks FK_5cb6ca4667dfa947871694da959; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT "FK_5cb6ca4667dfa947871694da959" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: chat_rooms FK_65b04eb62dcded1647ea9c58797; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_rooms
    ADD CONSTRAINT "FK_65b04eb62dcded1647ea9c58797" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: project_columns FK_6aa5ff4c733c42bd008f174ac61; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_columns
    ADD CONSTRAINT "FK_6aa5ff4c733c42bd008f174ac61" FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: task_pushes FK_6bd3174789511411835852402f3; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_pushes
    ADD CONSTRAINT "FK_6bd3174789511411835852402f3" FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: task_activities FK_6c16dbc1f4693fc90f1a7f87a96; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_activities
    ADD CONSTRAINT "FK_6c16dbc1f4693fc90f1a7f87a96" FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: task_watchers FK_6ec69c77281f4bc0a18fdbc722a; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_watchers
    ADD CONSTRAINT "FK_6ec69c77281f4bc0a18fdbc722a" FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: task_tags FK_70515bc464901781ac60b82a1ea; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_tags
    ADD CONSTRAINT "FK_70515bc464901781ac60b82a1ea" FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: workspace_github_installations FK_7651063467702aa3c00342cf5a0; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_github_installations
    ADD CONSTRAINT "FK_7651063467702aa3c00342cf5a0" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: push_review_comments FK_7703ecfaeac5448931bb44ddd7a; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_review_comments
    ADD CONSTRAINT "FK_7703ecfaeac5448931bb44ddd7a" FOREIGN KEY (parent_id) REFERENCES public.push_review_comments(id) ON DELETE CASCADE;


--
-- Name: chat_members FK_77fdf93db1e71ac272091e67592; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_members
    ADD CONSTRAINT "FK_77fdf93db1e71ac272091e67592" FOREIGN KEY (room_id) REFERENCES public.chat_rooms(id) ON DELETE CASCADE;


--
-- Name: chat_messages FK_7f52e11d11d4e8cc41224352869; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT "FK_7f52e11d11d4e8cc41224352869" FOREIGN KEY (room_id) REFERENCES public.chat_rooms(id) ON DELETE CASCADE;


--
-- Name: tasks FK_855d484825b715c545349212c7f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT "FK_855d484825b715c545349212c7f" FOREIGN KEY (assignee_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: developer_project_stats FK_8a5d24ffeeed0b77be74728f6f0; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.developer_project_stats
    ADD CONSTRAINT "FK_8a5d24ffeeed0b77be74728f6f0" FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: projects FK_8a7ccdb94bcc8635f933c8f8080; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT "FK_8a7ccdb94bcc8635f933c8f8080" FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: task_pushes FK_958583843ab7d75e3d76b76e561; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_pushes
    ADD CONSTRAINT "FK_958583843ab7d75e3d76b76e561" FOREIGN KEY (reviewed_by) REFERENCES public.users(id);


--
-- Name: tasks FK_986f14173dba32448f3f3abb1c4; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT "FK_986f14173dba32448f3f3abb1c4" FOREIGN KEY (column_id) REFERENCES public.project_columns(id) ON DELETE SET NULL;


--
-- Name: notifications FK_9a8a82462cab47c73d25f49261f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT "FK_9a8a82462cab47c73d25f49261f" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: push_review_comments FK_9d5fe3a2d415271554fb269f69c; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_review_comments
    ADD CONSTRAINT "FK_9d5fe3a2d415271554fb269f69c" FOREIGN KEY (push_id) REFERENCES public.task_pushes(id) ON DELETE CASCADE;


--
-- Name: chat_members FK_9dc61e92eed1dc151c2b2ef01a0; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_members
    ADD CONSTRAINT "FK_9dc61e92eed1dc151c2b2ef01a0" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: push_review_comments FK_9e416520ae42028577013198b50; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_review_comments
    ADD CONSTRAINT "FK_9e416520ae42028577013198b50" FOREIGN KEY (resolved_by) REFERENCES public.users(id);


--
-- Name: chat_messages FK_9e5fc47ecb06d4d7b84633b1718; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT "FK_9e5fc47ecb06d4d7b84633b1718" FOREIGN KEY (sender_id) REFERENCES public.users(id);


--
-- Name: tasks FK_9eecdb5b1ed8c7c2a1b392c28d4; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT "FK_9eecdb5b1ed8c7c2a1b392c28d4" FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: groups FK_a2fa29bfd5351b5b7ccacbc9f7c; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT "FK_a2fa29bfd5351b5b7ccacbc9f7c" FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: task_sequences FK_a4c920b990ff41497ae98f832f1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_sequences
    ADD CONSTRAINT "FK_a4c920b990ff41497ae98f832f1" FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: developer_daily_stats FK_a6f8ceb77c779e1a8abdc1a271d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.developer_daily_stats
    ADD CONSTRAINT "FK_a6f8ceb77c779e1a8abdc1a271d" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: task_activities FK_abbe268557f0c4fd08d21e7248b; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_activities
    ADD CONSTRAINT "FK_abbe268557f0c4fd08d21e7248b" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: projects FK_af78b8fc6857fe0a10d1bb1699e; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT "FK_af78b8fc6857fe0a10d1bb1699e" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: groups FK_b249fc0de77c1575349389dcf57; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT "FK_b249fc0de77c1575349389dcf57" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: projects FK_b33cd356a7e338df6d21088bba0; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT "FK_b33cd356a7e338df6d21088bba0" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE SET NULL;


--
-- Name: chat_reactions FK_b3409942f1ea185576f1adce065; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_reactions
    ADD CONSTRAINT "FK_b3409942f1ea185576f1adce065" FOREIGN KEY (message_id) REFERENCES public.chat_messages(id) ON DELETE CASCADE;


--
-- Name: message_attachments FK_bf65c3db8657cef6197b68b8c88; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_attachments
    ADD CONSTRAINT "FK_bf65c3db8657cef6197b68b8c88" FOREIGN KEY (message_id) REFERENCES public.chat_messages(id) ON DELETE CASCADE;


--
-- Name: chat_rooms FK_c4ccd00eaf869146454230e2cbc; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_rooms
    ADD CONSTRAINT "FK_c4ccd00eaf869146454230e2cbc" FOREIGN KEY (last_message_id) REFERENCES public.chat_messages(id) ON DELETE SET NULL;


--
-- Name: chat_rooms FK_c5d47b9b7908c0910fd2441905b; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_rooms
    ADD CONSTRAINT "FK_c5d47b9b7908c0910fd2441905b" FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: workspace_invitations FK_cf5df369b7a86ea3cdf18c7b56d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_invitations
    ADD CONSTRAINT "FK_cf5df369b7a86ea3cdf18c7b56d" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: chat_room_invites FK_chat_room_invites_created_by; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_room_invites
    ADD CONSTRAINT "FK_chat_room_invites_created_by" FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: chat_room_invites FK_chat_room_invites_room; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_room_invites
    ADD CONSTRAINT "FK_chat_room_invites_room" FOREIGN KEY (room_id) REFERENCES public.chat_rooms(id) ON DELETE CASCADE;


--
-- Name: task_pushes FK_d761ec18793af401e57744410dc; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_pushes
    ADD CONSTRAINT "FK_d761ec18793af401e57744410dc" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: audit_logs FK_e140f8ddef870ea93925f251f26; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT "FK_e140f8ddef870ea93925f251f26" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE SET NULL;


--
-- Name: workspace_invitations FK_e15b64a40ebe61dc98b993edd48; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_invitations
    ADD CONSTRAINT "FK_e15b64a40ebe61dc98b993edd48" FOREIGN KEY (invited_by) REFERENCES public.users(id);


--
-- Name: repositories FK_ef165ed919cfdafd420660e3186; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repositories
    ADD CONSTRAINT "FK_ef165ed919cfdafd420660e3186" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: user_ip_logs FK_f17d339f7eba1d1d14888294532; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_ip_logs
    ADD CONSTRAINT "FK_f17d339f7eba1d1d14888294532" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: tasks FK_f4cb489461bc751498a28852356; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT "FK_f4cb489461bc751498a28852356" FOREIGN KEY (creator_id) REFERENCES public.users(id);


--
-- Name: task_tags FK_f883135d033e1541f6a81972e7d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_tags
    ADD CONSTRAINT "FK_f883135d033e1541f6a81972e7d" FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE;


--
-- Name: task_watchers FK_ff976f3fc177614cc4a60291de1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_watchers
    ADD CONSTRAINT "FK_ff976f3fc177614cc4a60291de1" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: meeting_recordings FK_meeting_recordings_meeting; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_recordings
    ADD CONSTRAINT "FK_meeting_recordings_meeting" FOREIGN KEY (meeting_id) REFERENCES public.meetings(id) ON DELETE CASCADE;


--
-- Name: meeting_recordings FK_meeting_recordings_started_by; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_recordings
    ADD CONSTRAINT "FK_meeting_recordings_started_by" FOREIGN KEY (started_by) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: notes FK_notes_creator; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT "FK_notes_creator" FOREIGN KEY (creator_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: notes FK_notes_project; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT "FK_notes_project" FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: notes FK_notes_task; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT "FK_notes_task" FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: notes FK_notes_workspace; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT "FK_notes_workspace" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: project_members FK_project_members_invited_by; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_members
    ADD CONSTRAINT "FK_project_members_invited_by" FOREIGN KEY (invited_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: project_members FK_project_members_project; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_members
    ADD CONSTRAINT "FK_project_members_project" FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: project_members FK_project_members_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_members
    ADD CONSTRAINT "FK_project_members_user" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: earnings earnings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.earnings
    ADD CONSTRAINT earnings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: earnings earnings_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.earnings
    ADD CONSTRAINT earnings_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: meeting_participants meeting_participants_meeting_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_participants
    ADD CONSTRAINT meeting_participants_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES public.meetings(id) ON DELETE CASCADE;


--
-- Name: meeting_participants meeting_participants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_participants
    ADD CONSTRAINT meeting_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: meetings meetings_host_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT meetings_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: meetings meetings_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT meetings_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: user_notification_prefs user_notification_prefs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notification_prefs
    ADD CONSTRAINT user_notification_prefs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_violations user_violations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_violations
    ADD CONSTRAINT user_violations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;



--
-- MERGE PATCH (from UPZ-main) -- ported features not yet in the
-- setup_production snapshot: OTIMA community channel/group, meeting file
-- sharing, and random 6-digit public user IDs. All statements are
-- idempotent (IF NOT EXISTS / duplicate_object-safe) so this is safe to
-- run against a fresh database created straight from this init.sql.
-- See MERGE_NOTES.md for details.
--

-- ── 1. OTIMA community: chat_rooms structural columns ──────────────────────
ALTER TABLE public.chat_rooms
  ADD COLUMN IF NOT EXISTS slug varchar(100),
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS membership_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS posting_mode varchar(20) NOT NULL DEFAULT 'members',
  ADD COLUMN IF NOT EXISTS linked_room_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_chat_rooms_system_slug"
  ON public.chat_rooms (lower(slug)) WHERE is_system = true;

DO $$ BEGIN
  ALTER TABLE public.chat_rooms ADD CONSTRAINT "FK_chat_rooms_linked_room"
    FOREIGN KEY (linked_room_id) REFERENCES public.chat_rooms(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. OTIMA community: chat_members role/moderation columns ───────────────
ALTER TABLE public.chat_members
  ADD COLUMN IF NOT EXISTS role varchar(20) NOT NULL DEFAULT 'member',
  ADD COLUMN IF NOT EXISTS is_banned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS banned_until timestamptz;

-- ── 3. OTIMA community: chat_messages discussion-thread columns ────────────
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS source_channel_message_id uuid,
  ADD COLUMN IF NOT EXISTS discussion_root_message_id uuid,
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_chat_messages_source_discussion"
  ON public.chat_messages (source_channel_message_id)
  WHERE source_channel_message_id IS NOT NULL AND deleted_at IS NULL;

-- ── 4. OTIMA community: seed the channel + discussion group ────────────────
INSERT INTO public.chat_rooms
  ("type", name, description, slug, is_system, membership_locked, posting_mode, is_public, scope, created_at, updated_at)
SELECT 'group'::public.chat_rooms_type_enum,
  'OTIMA Community', 'OTIMA rasmiy yangiliklari va e''lonlari',
  'otima-community', true, true, 'admins_only', true, 'public'::public.room_scope_enum, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM public.chat_rooms WHERE slug = 'otima-community');

INSERT INTO public.chat_rooms
  ("type", name, description, slug, is_system, membership_locked, posting_mode, is_public, scope, created_at, updated_at)
SELECT 'group'::public.chat_rooms_type_enum,
  'OTIMA Community Group', 'OTIMA hamjamiyati uchun umumiy muhokama guruhi',
  'otima-community-group', true, true, 'members', true, 'public'::public.room_scope_enum, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM public.chat_rooms WHERE slug = 'otima-community-group');

UPDATE public.chat_rooms c SET linked_room_id = g.id
FROM public.chat_rooms g WHERE c.slug = 'otima-community' AND g.slug = 'otima-community-group';
UPDATE public.chat_rooms g SET linked_room_id = c.id
FROM public.chat_rooms c WHERE g.slug = 'otima-community-group' AND c.slug = 'otima-community';

-- ── 5. OTIMA community: auto-membership + immutability triggers ────────────
CREATE OR REPLACE FUNCTION public.ensure_otima_system_memberships()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.chat_members (room_id, user_id, status, role, joined_at)
  SELECT id, NEW.id, 'active', 'member', now()
  FROM public.chat_rooms WHERE slug IN ('otima-community', 'otima-community-group')
  ON CONFLICT (room_id, user_id) DO UPDATE SET left_at = NULL, status = 'active';
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_users_otima_memberships ON public.users;
CREATE TRIGGER trg_users_otima_memberships
  AFTER INSERT ON public.users FOR EACH ROW EXECUTE FUNCTION public.ensure_otima_system_memberships();

INSERT INTO public.chat_members (room_id, user_id, status, role, joined_at)
SELECT r.id, u.id, 'active',
  CASE WHEN u.id = (SELECT id FROM public.users WHERE is_active = true AND deleted_at IS NULL ORDER BY created_at, id LIMIT 1)
    THEN 'admin' ELSE 'member' END,
  now()
FROM public.users u CROSS JOIN public.chat_rooms r
WHERE u.is_active = true AND u.deleted_at IS NULL
  AND r.slug IN ('otima-community', 'otima-community-group')
ON CONFLICT (room_id, user_id) DO UPDATE SET left_at = NULL, status = 'active';

CREATE OR REPLACE FUNCTION public.protect_otima_system_room()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.is_system THEN
    RAISE EXCEPTION 'System chat resources cannot be deleted';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_system AND
    (NEW.slug IS DISTINCT FROM OLD.slug OR NEW.name IS DISTINCT FROM OLD.name OR
     NEW.is_system IS DISTINCT FROM OLD.is_system OR
     NEW.membership_locked IS DISTINCT FROM OLD.membership_locked) THEN
    RAISE EXCEPTION 'Immutable system chat fields cannot be changed';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

DROP TRIGGER IF EXISTS trg_protect_otima_system_room ON public.chat_rooms;
CREATE TRIGGER trg_protect_otima_system_room
  BEFORE UPDATE OR DELETE ON public.chat_rooms FOR EACH ROW EXECUTE FUNCTION public.protect_otima_system_room();

CREATE OR REPLACE FUNCTION public.protect_locked_chat_membership()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE locked boolean;
BEGIN
  SELECT membership_locked INTO locked FROM public.chat_rooms WHERE id = OLD.room_id;
  IF locked AND (TG_OP = 'DELETE' OR NEW.left_at IS NOT NULL OR NEW.status <> 'active') THEN
    RAISE EXCEPTION 'Membership in this system chat is mandatory';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

DROP TRIGGER IF EXISTS trg_protect_locked_chat_membership ON public.chat_members;
CREATE TRIGGER trg_protect_locked_chat_membership
  BEFORE UPDATE OR DELETE ON public.chat_members FOR EACH ROW EXECUTE FUNCTION public.protect_locked_chat_membership();

-- ── 6. Meeting file sharing ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.meeting_shared_files (
  id uuid NOT NULL DEFAULT public.uuid_generate_v4(),
  meeting_id uuid NOT NULL,
  shared_by uuid NOT NULL,
  file_name character varying(500) NOT NULL,
  mime_type character varying(200) NOT NULL,
  file_size bigint NOT NULL,
  storage_key text NOT NULL,
  storage_url text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "PK_meeting_shared_files" PRIMARY KEY (id),
  CONSTRAINT "UQ_meeting_shared_files_storage_key" UNIQUE (storage_key),
  CONSTRAINT "FK_meeting_shared_files_meeting" FOREIGN KEY (meeting_id) REFERENCES public.meetings(id) ON DELETE CASCADE,
  CONSTRAINT "FK_meeting_shared_files_user" FOREIGN KEY (shared_by) REFERENCES public.users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "IDX_meeting_shared_files_meeting" ON public.meeting_shared_files (meeting_id, created_at DESC);

-- ── 7. Random 6-digit public user IDs ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.public_user_id_registry (
  public_id integer PRIMARY KEY CHECK (public_id BETWEEN 100000 AND 999999),
  user_id uuid NOT NULL UNIQUE,
  assigned_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS public_id integer;

CREATE OR REPLACE FUNCTION public.reserve_six_digit_public_id(target_user uuid, preferred integer DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE candidate integer;
BEGIN
  IF preferred IS NOT NULL THEN
    INSERT INTO public.public_user_id_registry(public_id, user_id) VALUES (preferred, target_user);
    RETURN preferred;
  END IF;
  LOOP
    candidate := floor(random() * 900000 + 100000)::integer;
    INSERT INTO public.public_user_id_registry(public_id, user_id)
    VALUES (candidate, target_user) ON CONFLICT DO NOTHING;
    IF FOUND THEN RETURN candidate; END IF;
  END LOOP;
END $$;

-- Backfill any pre-existing users (no-op on a fresh database)
DO $$ DECLARE current_user_row record; assigned integer;
BEGIN
  FOR current_user_row IN SELECT id FROM public.users WHERE public_id IS NULL LOOP
    assigned := public.reserve_six_digit_public_id(current_user_row.id);
    UPDATE public.users SET public_id = assigned WHERE id = current_user_row.id;
  END LOOP;
END $$;

ALTER TABLE public.users ALTER COLUMN public_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_users_public_id" ON public.users(public_id);
ALTER TABLE public.users ALTER COLUMN username DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.protect_user_public_id() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.public_id IS DISTINCT FROM OLD.public_id THEN RAISE EXCEPTION 'Public user ID is immutable'; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.assign_random_public_user_id()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.public_id IS NULL THEN NEW.public_id := public.reserve_six_digit_public_id(NEW.id); ELSE
    INSERT INTO public.public_user_id_registry(public_id, user_id) VALUES (NEW.public_id, NEW.id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_assign_random_public_user_id ON public.users;
CREATE TRIGGER trg_assign_random_public_user_id
  BEFORE INSERT ON public.users FOR EACH ROW EXECUTE FUNCTION public.assign_random_public_user_id();

DROP TRIGGER IF EXISTS trg_protect_user_public_id ON public.users;
CREATE TRIGGER trg_protect_user_public_id
  BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.protect_user_public_id();

-- ── 6. Chat appearance: room background (admin-managed) + per-user wallpaper ──
-- See SYSTEM_DESIGN.md §14.10 for the design rationale (priority order:
-- user_chat_settings.background_url -> chat_rooms.background_url -> default theme).
ALTER TABLE public.chat_rooms
  ADD COLUMN IF NOT EXISTS background_url text,
  ADD COLUMN IF NOT EXISTS background_type varchar(20) NOT NULL DEFAULT 'DEFAULT';

CREATE TABLE IF NOT EXISTS public.user_chat_settings (
  id uuid DEFAULT public.uuid_generate_v4() NOT NULL PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  background_url text,
  background_type varchar(20),
  theme varchar(20),
  font_size integer,
  compact_mode boolean NOT NULL DEFAULT false,
  animation_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, room_id)
);

CREATE INDEX IF NOT EXISTS "IDX_user_chat_settings_user" ON public.user_chat_settings (user_id);

-- ── 7. Message drafts (Telegram-style unsent text, restored per room) ──────
-- See SYSTEM_DESIGN.md §14.12.
CREATE TABLE IF NOT EXISTS public.message_drafts (
  id uuid DEFAULT public.uuid_generate_v4() NOT NULL PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, room_id)
);

CREATE INDEX IF NOT EXISTS "IDX_message_drafts_user" ON public.message_drafts (user_id);

-- ── 8. Slack-style message threads (§14.13) ─────────────────────────────────
-- Thread replies are a distinct concept from the existing inline reply_to_id
-- quote-reply: they're excluded from the main room timeline (listMessages)
-- and only surface in the thread panel, matching Slack's "doesn't clutter
-- the channel" behavior. reply_to_id is still set (= root message id) so
-- existing reply-lookup code keeps working; is_thread_reply is what actually
-- hides them from the main feed.
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS is_thread_reply boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.message_threads (
  id uuid DEFAULT public.uuid_generate_v4() NOT NULL PRIMARY KEY,
  room_id uuid NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  root_message_id uuid NOT NULL UNIQUE REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  reply_count integer NOT NULL DEFAULT 0,
  last_reply_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_chat_messages_thread_replies"
  ON public.chat_messages (reply_to_id) WHERE is_thread_reply = true;

--
-- PostgreSQL database dump complete
--

-- OPTIMA Education trusted catalog
CREATE TABLE IF NOT EXISTS public.education_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  youtube_channel_id varchar(32),
  channel_name varchar(180) NOT NULL,
  channel_handle varchar(120),
  channel_url text,
  avatar_url text,
  banner_url text,
  description text,
  default_language varchar(12) NOT NULL DEFAULT 'uz',
  country varchar(8) DEFAULT 'UZ',
  subjects text[] NOT NULL DEFAULT '{}',
  exam_types text[] NOT NULL DEFAULT '{}',
  trust_level varchar(16) NOT NULL DEFAULT 'pending'
    CHECK (trust_level IN ('official', 'verified', 'trusted', 'pending', 'blocked')),
  is_verified boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  auto_sync_enabled boolean NOT NULL DEFAULT false,
  sync_interval_hours integer NOT NULL DEFAULT 24,
  display_order integer NOT NULL DEFAULT 0,
  last_synced_at timestamptz,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS education_channels_youtube_uidx
  ON public.education_channels(youtube_channel_id) WHERE youtube_channel_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS education_channels_name_pending_uidx
  ON public.education_channels(lower(channel_name)) WHERE youtube_channel_id IS NULL;

CREATE TABLE IF NOT EXISTS public.education_playlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  youtube_playlist_id varchar(64) NOT NULL UNIQUE,
  channel_id uuid NOT NULL REFERENCES public.education_channels(id) ON DELETE CASCADE,
  title varchar(240) NOT NULL,
  description text,
  subject varchar(64),
  exam_type varchar(64),
  level varchar(32),
  language varchar(12) NOT NULL DEFAULT 'uz',
  thumbnail_url text,
  is_verified boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.education_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  youtube_video_id varchar(24) NOT NULL UNIQUE,
  channel_id uuid NOT NULL REFERENCES public.education_channels(id) ON DELETE RESTRICT,
  playlist_id uuid REFERENCES public.education_playlists(id) ON DELETE SET NULL,
  title varchar(300) NOT NULL,
  description text,
  thumbnail_url text,
  published_at timestamptz,
  duration_seconds integer NOT NULL DEFAULT 0,
  language varchar(12) NOT NULL DEFAULT 'uz',
  subject varchar(64),
  topic varchar(120),
  exam_type varchar(64),
  exam_section varchar(64),
  level varchar(32),
  tags text[] NOT NULL DEFAULT '{}',
  relevance_score numeric(5,2) NOT NULL DEFAULT 0,
  quality_score numeric(5,2) NOT NULL DEFAULT 0,
  moderation_status varchar(16) NOT NULL DEFAULT 'pending'
    CHECK (moderation_status IN ('pending', 'approved', 'rejected', 'hidden', 'unavailable')),
  is_embeddable boolean NOT NULL DEFAULT true,
  is_short boolean NOT NULL DEFAULT false,
  is_live boolean NOT NULL DEFAULT false,
  is_available boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  lesson_outline text,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS education_videos_public_idx
  ON public.education_videos(subject, published_at DESC)
  WHERE moderation_status = 'approved' AND is_available AND is_embeddable;
CREATE INDEX IF NOT EXISTS education_videos_search_idx
  ON public.education_videos USING gin(
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(topic, ''))
  );

CREATE TABLE IF NOT EXISTS public.education_saved_videos (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES public.education_videos(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, video_id)
);
CREATE TABLE IF NOT EXISTS public.education_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES public.education_videos(id) ON DELETE CASCADE,
  watch_progress_percent numeric(5,2) NOT NULL DEFAULT 0,
  last_position_seconds integer NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT false,
  first_opened_at timestamptz NOT NULL DEFAULT now(),
  last_opened_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  total_watch_seconds integer NOT NULL DEFAULT 0,
  quiz_score numeric(5,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, video_id)
);
CREATE TABLE IF NOT EXISTS public.education_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES public.education_videos(id) ON DELETE CASCADE,
  content text NOT NULL,
  timestamp_seconds integer,
  is_favorite boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS education_notes_owner_idx
  ON public.education_notes(user_id, video_id, created_at DESC);
CREATE TABLE IF NOT EXISTS public.education_video_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES public.education_videos(id) ON DELETE CASCADE,
  reason varchar(40) NOT NULL,
  details text,
  status varchar(16) NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, video_id)
);

-- Profile-level default chat wallpaper — used as the fallback background for a
-- user's chats when no per-room user_chat_settings.background_url override exists.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS background_url text;

-- ── Chat route redesign: chat_rooms.public_id + slug (mirrors users.public_id,
-- see init.sql "public_user_id_registry" above) so group/channel/DM URLs never
-- expose the internal UUID (/g/<slug-or-public_id>, /ch/..., /u/<username-or-public_id>).
CREATE TABLE IF NOT EXISTS public.chat_room_public_id_registry (
  public_id integer PRIMARY KEY CHECK (public_id BETWEEN 100000 AND 999999),
  room_id uuid NOT NULL UNIQUE,
  assigned_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_rooms ADD COLUMN IF NOT EXISTS public_id integer;

CREATE OR REPLACE FUNCTION public.reserve_six_digit_room_public_id(target_room uuid)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE candidate integer;
BEGIN
  LOOP
    candidate := floor(random() * 900000 + 100000)::integer;
    INSERT INTO public.chat_room_public_id_registry(public_id, room_id)
    VALUES (candidate, target_room) ON CONFLICT DO NOTHING;
    IF FOUND THEN RETURN candidate; END IF;
  END LOOP;
END $$;

-- Backfill any pre-existing rooms (no-op on a fresh database)
DO $$ DECLARE current_room_row record; assigned integer;
BEGIN
  FOR current_room_row IN SELECT id FROM public.chat_rooms WHERE public_id IS NULL LOOP
    assigned := public.reserve_six_digit_room_public_id(current_room_row.id);
    UPDATE public.chat_rooms SET public_id = assigned WHERE id = current_room_row.id;
  END LOOP;
END $$;

ALTER TABLE public.chat_rooms ALTER COLUMN public_id SET NOT NULL;

CREATE OR REPLACE FUNCTION public.protect_room_public_id() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.public_id IS DISTINCT FROM OLD.public_id THEN RAISE EXCEPTION 'Room public ID is immutable'; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.assign_random_room_public_id()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.public_id IS NULL THEN NEW.public_id := public.reserve_six_digit_room_public_id(NEW.id); ELSE
    INSERT INTO public.chat_room_public_id_registry(public_id, room_id) VALUES (NEW.public_id, NEW.id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_assign_random_room_public_id ON public.chat_rooms;
CREATE TRIGGER trg_assign_random_room_public_id
  BEFORE INSERT ON public.chat_rooms FOR EACH ROW EXECUTE FUNCTION public.assign_random_room_public_id();

DROP TRIGGER IF EXISTS trg_protect_room_public_id ON public.chat_rooms;
CREATE TRIGGER trg_protect_room_public_id
  BEFORE UPDATE ON public.chat_rooms FOR EACH ROW EXECUTE FUNCTION public.protect_room_public_id();

-- chat_rooms.slug already exists (see "OTIMA community" block above), but was only
-- unique for is_system rows. Widen it to every room with a slug set (admin-settable,
-- optional — /g and /ch fall back to public_id when unset).
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_chat_rooms_slug"
  ON public.chat_rooms (lower(slug)) WHERE slug IS NOT NULL;

-- Records an old slug whenever an admin renames a room, so a stale /g/<old-slug> or
-- /ch/<old-slug> link can still be resolved and redirected to the current one.
CREATE TABLE IF NOT EXISTS public.chat_room_slug_history (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v4(),
  room_id uuid NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  old_slug varchar(100) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "IDX_chat_room_slug_history_slug" ON public.chat_room_slug_history (lower(old_slug));

-- Account privacy: PUBLIC users show up in fuzzy user search (Ctrl+K / "start a
-- DM" picker); PRIVATE users are hidden from fuzzy search but stay reachable by
-- an exact @username or public_id match (profile link, invite, existing chat) -
-- so privacy blocks casual discovery without breaking sharing/invites.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS account_visibility varchar(20) NOT NULL DEFAULT 'public';


