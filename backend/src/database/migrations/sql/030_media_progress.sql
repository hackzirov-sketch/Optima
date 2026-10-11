-- 030_media_progress.sql — where someone stopped reading a book, so the
-- library can offer "continue reading". `position` is a fraction of the text
-- (0..1): page numbers depend on screen and font size, the fraction doesn't.
CREATE TABLE IF NOT EXISTS media_progress (
  media_id uuid NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  position double precision NOT NULL CHECK (position >= 0 AND position <= 1),
  page integer NOT NULL DEFAULT 0,
  total_pages integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (media_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_media_progress_user ON media_progress (user_id, updated_at DESC);
