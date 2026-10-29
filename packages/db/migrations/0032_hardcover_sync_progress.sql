-- Execution checkpoints are distinct from completed source watermarks.
CREATE TABLE hardcover_sync_progress (
  connection_id TEXT PRIMARY KEY NOT NULL REFERENCES connections(id) ON DELETE RESTRICT,
  sync_run_id TEXT NOT NULL REFERENCES sync_runs(id) ON DELETE RESTRICT,
  checkpoint_json TEXT NOT NULL CHECK (json_valid(checkpoint_json) AND json_type(checkpoint_json) = 'object'),
  updated_at TEXT NOT NULL
);
CREATE TRIGGER hardcover_sync_progress_owner_insert
BEFORE INSERT ON hardcover_sync_progress BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM connections c JOIN sync_runs r ON r.connection_id=c.id
    WHERE c.id=NEW.connection_id AND c.source='hardcover' AND r.id=NEW.sync_run_id
  ) THEN RAISE(ABORT, 'Hardcover progress requires a run for the same Hardcover connection') END;
END;
CREATE TRIGGER hardcover_sync_progress_owner_update
BEFORE UPDATE ON hardcover_sync_progress BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM connections c JOIN sync_runs r ON r.connection_id=c.id
    WHERE c.id=NEW.connection_id AND c.source='hardcover' AND r.id=NEW.sync_run_id
  ) THEN RAISE(ABORT, 'Hardcover progress requires a run for the same Hardcover connection') END;
END;
