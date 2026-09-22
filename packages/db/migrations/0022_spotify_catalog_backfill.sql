CREATE TABLE spotify_catalog_backfill_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE RESTRICT,
  sync_run_id TEXT NOT NULL UNIQUE REFERENCES sync_runs(id) ON DELETE RESTRICT,
  state TEXT NOT NULL CHECK (state IN ('pending','running','succeeded','failed')),
  phase TEXT NOT NULL CHECK (phase IN ('tracks','episodes')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  requested_count INTEGER NOT NULL DEFAULT 0 CHECK (requested_count >= 0),
  returned_count INTEGER NOT NULL DEFAULT 0 CHECK (returned_count >= 0),
  unavailable_count INTEGER NOT NULL DEFAULT 0 CHECK (unavailable_count >= 0),
  lease_expires_at TEXT,
  next_attempt_at TEXT,
  safe_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE UNIQUE INDEX spotify_catalog_backfill_one_active_idx
  ON spotify_catalog_backfill_jobs((1)) WHERE state IN ('pending','running');
CREATE INDEX spotify_catalog_backfill_connection_idx
  ON spotify_catalog_backfill_jobs(connection_id,created_at DESC);
