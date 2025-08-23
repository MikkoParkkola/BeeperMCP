-- Speed up sentiment histogram/trend queries
CREATE INDEX IF NOT EXISTS idx_messages_sentiment_partial
  ON messages (ts_utc)
  WHERE sentiment_score IS NOT NULL;

