-- Add tenant-scoped indexes and ensure RLS policies exist
-- for multi-tenant separation per Batch G guidelines.

-- Composite indexes to keep tenant lookups efficient
CREATE INDEX IF NOT EXISTS idx_messages_owner_room_ts ON messages (owner_id, room_id, ts_utc);
CREATE INDEX IF NOT EXISTS idx_messages_owner_sender_ts ON messages (owner_id, sender, ts_utc);
CREATE INDEX IF NOT EXISTS idx_messages_owner_lang ON messages (owner_id, lang);

CREATE INDEX IF NOT EXISTS idx_auto_send_rules_owner_room ON auto_send_rules (owner_id, room_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_owner_ts ON audit_log (owner_id, ts);

-- RLS policies are optional but reinforce tenant isolation
DO $$ BEGIN
  IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'messages' AND policyname = 'owner_isolation_messages'
  ) THEN
    ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
    CREATE POLICY owner_isolation_messages ON messages USING (owner_id = current_setting('app.user', true));
  END IF;
  IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'auto_send_rules' AND policyname = 'owner_isolation_rules'
  ) THEN
    ALTER TABLE auto_send_rules ENABLE ROW LEVEL SECURITY;
    CREATE POLICY owner_isolation_rules ON auto_send_rules USING (owner_id = current_setting('app.user', true));
  END IF;
  IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'audit_log' AND policyname = 'owner_isolation_audit'
  ) THEN
    ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
    CREATE POLICY owner_isolation_audit ON audit_log USING (owner_id = current_setting('app.user', true));
  END IF;
END $$;
