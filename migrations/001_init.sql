CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS messages (
  event_id text PRIMARY KEY,
  room_id text NOT NULL,
  sender text NOT NULL,
  text text,
  ts_utc timestamptz NOT NULL,
  lang text,
  participants text[] NOT NULL,
  is_me boolean NOT NULL DEFAULT false,
  thread_id text,
  has_media boolean NOT NULL DEFAULT false,
  media_types text[] NOT NULL DEFAULT '{}',
  tz_day date NOT NULL,
  tz_week int NOT NULL,
  tz_month int NOT NULL,
  tz_year int NOT NULL,
  tz_hour int NOT NULL,
  tz_dow int NOT NULL,
  tokens int,
  words int,
  chars int,
  attachments int,
  tsv tsvector,
  embedding vector,
  embedding_model_ver text,
  sentiment_score real,
  sentiment_subjectivity real,
  sentiment_emotions jsonb,
  sentiment_toxicity real,
  sentiment_politeness real,
  sentiment_model_ver text,
  sentiment_provenance text,
  derived_from jsonb
);

CREATE INDEX IF NOT EXISTS idx_messages_ts ON messages (ts_utc);
CREATE INDEX IF NOT EXISTS idx_messages_room_ts ON messages (room_id, ts_utc);
CREATE INDEX IF NOT EXISTS idx_messages_sender_ts ON messages (sender, ts_utc);
CREATE INDEX IF NOT EXISTS idx_messages_lang ON messages (lang);
CREATE INDEX IF NOT EXISTS idx_messages_types ON messages USING GIN (media_types);
CREATE INDEX IF NOT EXISTS idx_messages_tz ON messages (tz_year, tz_month, tz_week, tz_day, tz_hour, tz_dow);
CREATE INDEX IF NOT EXISTS idx_messages_participants ON messages USING GIN (participants);
CREATE INDEX IF NOT EXISTS idx_messages_tsv ON messages USING GIN (tsv);
-- ivfflat by default; swap to HNSW if available in your pgvector version
CREATE INDEX IF NOT EXISTS idx_messages_embedding ON messages USING ivfflat (embedding vector_cosine) WITH (lists = 100);
