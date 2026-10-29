-- This assertion table is used only inside a provider-write batch. The first
-- statement verifies the worker's lease generation, the final statement removes
-- the assertion. A failed fence rolls back the entire batch; successful batches
-- never retain scratch rows.
CREATE TABLE catalog_write_guards (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id=1),
  lease_owned INTEGER NOT NULL CONSTRAINT catalog_lease_owned CHECK (lease_owned=1)
);

-- A partial run can checkpoint a fully committed primary scan while reporting
-- an independent optional scan failure. Pending/running/failed runs cannot.
DROP TRIGGER sync_cursors_require_successful_run_insert;
DROP TRIGGER sync_cursors_require_successful_run_update;
CREATE TRIGGER sync_cursors_require_successful_run_insert
BEFORE INSERT ON sync_cursors
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM sync_runs WHERE id=NEW.sync_run_id
      AND connection_id=NEW.connection_id
      AND status IN ('succeeded','partially_succeeded')
  ) THEN RAISE(ABORT, 'cursor requires a completed sync run for the same connection') END;
END;
CREATE TRIGGER sync_cursors_require_successful_run_update
BEFORE UPDATE ON sync_cursors
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM sync_runs WHERE id=NEW.sync_run_id
      AND connection_id=NEW.connection_id
      AND status IN ('succeeded','partially_succeeded')
  ) THEN RAISE(ABORT, 'cursor requires a completed sync run for the same connection') END;
END;
