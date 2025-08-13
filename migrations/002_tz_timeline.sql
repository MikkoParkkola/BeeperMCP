CREATE TABLE IF NOT EXISTS tz_timeline (
  since timestamptz PRIMARY KEY,
  tz text NOT NULL
);

INSERT INTO tz_timeline (since, tz)
VALUES ('1970-01-01T00:00:00Z', 'Europe/Amsterdam')
ON CONFLICT DO NOTHING;
