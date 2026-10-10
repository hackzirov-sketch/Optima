-- 025_book_reviews.sql — reader reviews for library books
--
-- Books come from open catalogues (Internet Archive, Project Gutenberg), so
-- there is no local book row: a review is keyed by the source's id,
-- "ia:<identifier>" or "gb:<number>". One review per reader per book.
CREATE TABLE IF NOT EXISTS book_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_key varchar(140) NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (book_key, user_id)
);
CREATE INDEX IF NOT EXISTS idx_book_reviews_book ON book_reviews (book_key, created_at DESC);
