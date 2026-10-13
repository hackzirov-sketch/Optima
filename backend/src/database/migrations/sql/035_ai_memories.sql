-- 035_ai_memories.sql — what Optima AI remembers about each person (Claude
-- memory style): short durable facts it reads before answering and updates
-- after each saved exchange. The person can see, edit, clear or turn it off.
CREATE TABLE IF NOT EXISTS ai_memories (
  user_id     uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  content     text NOT NULL DEFAULT '',
  enabled     boolean NOT NULL DEFAULT true,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
