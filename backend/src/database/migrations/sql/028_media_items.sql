-- 028_media_items.sql — YouTube videos and library books become our own
-- records with their own short public slug (/youtube/k7Qm2xPa,
-- /library/R4tz9LcW), so views and likes can be counted per item and per
-- person instead of the pages being a bare pass-through to the provider.
--
-- view_count / like_count are running totals. Views and likes arrive in Redis
-- first and are written here in batches (MediaCountersService), each item on
-- its own schedule, so a popular video never turns into a write per view.
CREATE TABLE IF NOT EXISTS media_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug varchar(16) NOT NULL UNIQUE,
  provider varchar(16) NOT NULL CHECK (provider IN ('youtube', 'library')),
  -- YouTube video id, or the library book key (ol:OL123W, gb:1342).
  external_id varchar(160) NOT NULL,
  title text NOT NULL,
  subtitle text,
  thumbnail_url text,
  duration_seconds integer NOT NULL DEFAULT 0,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  view_count bigint NOT NULL DEFAULT 0,
  like_count bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, external_id)
);

-- Who watched / read what, and how many times.
CREATE TABLE IF NOT EXISTS media_views (
  media_id uuid NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  view_count integer NOT NULL DEFAULT 0,
  first_viewed_at timestamptz NOT NULL DEFAULT now(),
  last_viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (media_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_media_views_user ON media_views (user_id, last_viewed_at DESC);

CREATE TABLE IF NOT EXISTS media_likes (
  media_id uuid NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (media_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_media_likes_user ON media_likes (user_id);

-- Book likes move into media_likes; book_likes is then redundant.
DO $$
BEGIN
  IF to_regclass('public.book_likes') IS NOT NULL THEN
    INSERT INTO media_items (slug, provider, external_id, title, subtitle, thumbnail_url, meta)
    SELECT
      -- 8 url-safe characters; collisions are astronomically unlikely for the
      -- handful of rows here, and the UNIQUE constraint would stop one anyway.
      substr(translate(encode(decode(md5(bl.book_key || random()::text || clock_timestamp()::text), 'hex'), 'base64'), '+/=', 'xYz'), 1, 8),
      'library',
      bl.book_key,
      COALESCE(bs.book->>'title', bl.book_key),
      bs.book->'authors'->>0,
      bs.book->>'cover',
      CASE WHEN bs.book IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('book', bs.book) END
    FROM (SELECT DISTINCT book_key FROM book_likes) bl
    LEFT JOIN LATERAL (
      SELECT book FROM book_saves s WHERE s.book_key = bl.book_key LIMIT 1
    ) bs ON true
    ON CONFLICT (provider, external_id) DO NOTHING;

    INSERT INTO media_likes (media_id, user_id, created_at)
    SELECT m.id, bl.user_id, bl.created_at
      FROM book_likes bl
      JOIN media_items m ON m.provider = 'library' AND m.external_id = bl.book_key
    ON CONFLICT DO NOTHING;

    UPDATE media_items m
       SET like_count = (SELECT count(*) FROM media_likes l WHERE l.media_id = m.id)
     WHERE m.provider = 'library';

    DROP TABLE book_likes;
  END IF;
END $$;
