ALTER TABLE messages ADD COLUMN IF NOT EXISTS owner_id text NOT NULL DEFAULT 'local';
ALTER TABLE auto_send_rules ADD COLUMN IF NOT EXISTS owner_id text NOT NULL DEFAULT 'local';
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS owner_id text NOT NULL DEFAULT 'local';

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_send_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY owner_isolation_messages ON messages USING (owner_id = current_setting('app.user', true));
CREATE POLICY owner_isolation_rules ON auto_send_rules USING (owner_id = current_setting('app.user', true));
CREATE POLICY owner_isolation_audit ON audit_log USING (owner_id = current_setting('app.user', true));
