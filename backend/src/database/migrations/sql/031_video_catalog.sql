-- 031_video_catalog.sql — the Optima video feed.
--
-- video_catalog: YouTube videos we've seen (seed searches every few hours,
-- user searches, the curated education catalogue), each classified once by
-- rules (no LLM): educational value, content type, topics, provenance, and
-- whether it's rejected — rejected videos are never shown, search included.
--
-- media_views.watch_seconds: how long each person actually played a video
-- (from the player), for the Spend Time signal.
ALTER TABLE media_views ADD COLUMN IF NOT EXISTS watch_seconds integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS video_catalog (
  youtube_video_id varchar(11) PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  channel_id varchar(64) NOT NULL DEFAULT '',
  channel_title text NOT NULL DEFAULT '',
  category_id varchar(4),
  tags text[] NOT NULL DEFAULT '{}',
  duration_seconds integer NOT NULL DEFAULT 0,
  published_at timestamptz,
  view_count bigint,
  like_count bigint,
  content_type varchar(20) NOT NULL DEFAULT 'other',
  topics text[] NOT NULL DEFAULT '{}',
  educational smallint NOT NULL DEFAULT 0,
  provenance smallint NOT NULL DEFAULT 50,
  rejected boolean NOT NULL DEFAULT false,
  reasons text[] NOT NULL DEFAULT '{}',
  source varchar(16) NOT NULL DEFAULT 'search',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_video_catalog_feed ON video_catalog (educational DESC) WHERE NOT rejected;
