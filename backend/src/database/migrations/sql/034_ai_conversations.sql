-- 034_ai_conversations.sql — Optima AI keeps conversations (Claude-style
-- sidebar): each one has a title and its messages. Images sent with a
-- question are not stored, only the fact that one was attached.
CREATE TABLE IF NOT EXISTS ai_conversations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       varchar(120) NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user ON ai_conversations (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  uuid NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role             varchar(8) NOT NULL CHECK (role IN ('user', 'model')),
  text             text NOT NULL DEFAULT '',
  has_image        boolean NOT NULL DEFAULT false,
  sources          jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation ON ai_messages (conversation_id, created_at);
