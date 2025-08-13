CREATE TABLE IF NOT EXISTS auto_send_rules (
  room_id text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  granted_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id bigserial PRIMARY KEY,
  ts timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL,
  actor text NOT NULL,
  payload jsonb NOT NULL
);
