-- 026_book_saves_likes.sql — a reader's saved books and likes live server-side
-- (they were in localStorage: lost on another device or a cleared browser).
-- The book snapshot (title, authors, cover) is kept with the save so the
-- "My books" shelf renders without asking the catalogue again.
CREATE TABLE IF NOT EXISTS book_saves (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_key varchar(140) NOT NULL,
  book jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, book_key)
);
CREATE INDEX IF NOT EXISTS idx_book_saves_user ON book_saves (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS book_likes (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_key varchar(140) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, book_key)
);
CREATE INDEX IF NOT EXISTS idx_book_likes_book ON book_likes (book_key);
