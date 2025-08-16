-- Enforce row level security for multi-tenant isolation
-- referencing Batch G guidance in AGENTS.md
ALTER TABLE messages FORCE ROW LEVEL SECURITY;
ALTER TABLE auto_send_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;

