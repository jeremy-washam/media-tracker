-- Durable admission survives Worker restarts and UTC-day boundaries. Failed or
-- interrupted attempts retain their reservation; retries cannot reset limits.
CREATE TABLE source_sync_admission (
  source TEXT NOT NULL,
  day TEXT NOT NULL,
  attempts INTEGER NOT NULL CHECK (attempts > 0),
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  outcome TEXT NOT NULL CHECK (outcome IN ('running', 'succeeded', 'failed')),
  reservation_json TEXT NOT NULL CHECK (json_valid(reservation_json)),
  usage_json TEXT CHECK (usage_json IS NULL OR json_valid(usage_json)),
  PRIMARY KEY (source, day)
);

CREATE INDEX source_sync_admission_latest ON source_sync_admission(source, started_at DESC);

CREATE TABLE source_sync_lease (
  id TEXT PRIMARY KEY CHECK (id = 'sources'),
  owner TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
