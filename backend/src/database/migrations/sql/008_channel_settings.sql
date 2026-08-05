-- 008_channel_settings.sql — per-room configuration, its audit trail, and
-- message view tracking.
--
-- Room configuration lived as ad-hoc columns on chat_rooms (posting_mode,
-- is_read_only, membership_locked). That worked while there were three of
-- them; the settings surface is now large enough that widening chat_rooms for
-- every toggle would make the hot listing query carry a payload that only the
-- settings dialog ever reads. So configuration gets its own row, joined only
-- when someone actually opens settings.
--
-- Sections that have no behaviour behind them yet (AI, analytics,
-- integrations, security, files, meeting, education) still get their columns
-- here on purpose: the UI can persist an operator's intent from day one, and
-- turning a setting on later becomes a code change rather than a migration
-- plus a backfill.

-- ── Roles ────────────────────────────────────────────────────────────────────
-- chat_members.role is a plain varchar with no constraint, so 'moderator' was
-- already storable — this states the vocabulary so a typo fails loudly rather
-- than creating a role nothing grants.
ALTER TABLE chat_members DROP CONSTRAINT IF EXISTS chk_chat_members_role;
ALTER TABLE chat_members ADD CONSTRAINT chk_chat_members_role
  CHECK (role IN ('owner', 'admin', 'moderator', 'member'));

-- ── Settings ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS channel_settings (
  room_id uuid PRIMARY KEY REFERENCES chat_rooms(id) ON DELETE CASCADE,

  -- Asosiy
  banner_url  text,
  language    varchar(8),
  category    varchar(40),

  -- Maxfiylik. Visibility itself stays on chat_rooms.scope: it drives the
  -- discovery query and a second copy would eventually disagree with it.
  discoverable       boolean NOT NULL DEFAULT true,
  allow_invite_links boolean NOT NULL DEFAULT true,
  join_requires_approval boolean NOT NULL DEFAULT false,

  -- Ruxsatlar. 'owner' | 'admins' | 'moderators' | 'members'
  who_can_post          varchar(16) NOT NULL DEFAULT 'admins',
  -- 'everyone' | 'subscribers' | 'verified' | 'disabled'
  who_can_comment       varchar(16) NOT NULL DEFAULT 'subscribers',
  who_can_upload_files  varchar(16) NOT NULL DEFAULT 'members',
  who_can_send_voice    varchar(16) NOT NULL DEFAULT 'members',
  who_can_send_media    varchar(16) NOT NULL DEFAULT 'members',
  reactions_enabled     boolean NOT NULL DEFAULT true,

  -- Moderatsiya
  auto_delete_days   integer,          -- NULL = never
  slow_mode_seconds  integer NOT NULL DEFAULT 0,
  spam_filter        boolean NOT NULL DEFAULT false,
  link_filter        boolean NOT NULL DEFAULT false,
  bad_words_filter   boolean NOT NULL DEFAULT false,
  bad_words          text[]  NOT NULL DEFAULT '{}',

  -- Notification
  default_notifications boolean NOT NULL DEFAULT true,
  mention_notifications boolean NOT NULL DEFAULT true,
  event_notifications   boolean NOT NULL DEFAULT true,
  email_notifications   boolean NOT NULL DEFAULT false,

  -- Kontent
  pinned_message_id uuid REFERENCES chat_messages(id) ON DELETE SET NULL,
  welcome_message   text,
  rules             text,
  faq               text,

  -- Files
  max_upload_bytes  bigint,            -- NULL = platform default
  allowed_file_types text[] NOT NULL DEFAULT '{}',  -- empty = platform default

  -- Security
  require_admin_2fa boolean NOT NULL DEFAULT false,

  -- Meeting
  allow_meetings        boolean NOT NULL DEFAULT true,
  allow_live_stream     boolean NOT NULL DEFAULT false,
  allow_screen_share    boolean NOT NULL DEFAULT true,
  allow_recording       boolean NOT NULL DEFAULT false,
  allow_meeting_chat    boolean NOT NULL DEFAULT true,

  -- AI
  ai_moderation  boolean NOT NULL DEFAULT false,
  ai_summary     boolean NOT NULL DEFAULT false,
  ai_tags        boolean NOT NULL DEFAULT false,
  ai_translate   boolean NOT NULL DEFAULT false,
  ai_spam_detect boolean NOT NULL DEFAULT false,

  -- Education / Workspace / Community
  course_id        uuid,
  playlist_id      uuid,
  track_progress   boolean NOT NULL DEFAULT false,
  linked_project_id uuid,
  auto_post_tasks  boolean NOT NULL DEFAULT false,
  is_verified      boolean NOT NULL DEFAULT false,
  min_reputation   integer NOT NULL DEFAULT 0,
  join_questions   text[]  NOT NULL DEFAULT '{}',

  -- Integrations. One JSONB rather than a column per provider: the set of
  -- providers changes far more often than the shape of this table should.
  integrations jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE channel_settings DROP CONSTRAINT IF EXISTS chk_channel_settings_audience;
ALTER TABLE channel_settings ADD CONSTRAINT chk_channel_settings_audience CHECK (
  who_can_post         IN ('owner', 'admins', 'moderators', 'members') AND
  who_can_upload_files IN ('owner', 'admins', 'moderators', 'members') AND
  who_can_send_voice   IN ('owner', 'admins', 'moderators', 'members') AND
  who_can_send_media   IN ('owner', 'admins', 'moderators', 'members') AND
  who_can_comment      IN ('everyone', 'subscribers', 'verified', 'disabled')
);

ALTER TABLE channel_settings DROP CONSTRAINT IF EXISTS chk_channel_settings_ranges;
ALTER TABLE channel_settings ADD CONSTRAINT chk_channel_settings_ranges CHECK (
  slow_mode_seconds BETWEEN 0 AND 3600 AND
  (auto_delete_days IS NULL OR auto_delete_days BETWEEN 1 AND 365) AND
  (max_upload_bytes IS NULL OR max_upload_bytes > 0) AND
  min_reputation >= 0
);

-- Seed a row for every existing channel/group, carrying over the posting rule
-- already in force so nothing changes behaviour on deploy.
INSERT INTO channel_settings (room_id, who_can_post)
SELECT id, CASE WHEN posting_mode = 'admins_only' THEN 'admins' ELSE 'members' END
  FROM chat_rooms
 WHERE type IN ('channel', 'group')
ON CONFLICT (room_id) DO NOTHING;

-- ── Audit trail ─────────────────────────────────────────────────────────────
-- "channel id, user id, what changed" — every write records the diff, so a
-- setting that mysteriously flipped has a name and a timestamp attached.
CREATE TABLE IF NOT EXISTS channel_settings_audit (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id    uuid NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  changes    jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_channel_settings_audit_room
  ON channel_settings_audit (room_id, created_at DESC);

-- ── Views ───────────────────────────────────────────────────────────────────
-- Written only by the batch worker draining Redis, never per-request: the
-- primary key is what makes the bulk INSERT ... ON CONFLICT DO NOTHING
-- idempotent, so a re-delivered batch costs nothing.
CREATE TABLE IF NOT EXISTS message_views (
  message_id uuid NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);
-- "Which messages has this user seen" — needed to avoid re-counting on reload.
CREATE INDEX IF NOT EXISTS idx_message_views_user ON message_views (user_id);

-- chat_messages.view_count already exists and is already selected by
-- CHAT_MESSAGE_COLUMNS_SQL, so the flusher increments that rather than adding
-- a second counter the API would never return.
