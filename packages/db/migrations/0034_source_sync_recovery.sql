-- Bind page continuations to their real snapshot and retain provider cooldowns.
ALTER TABLE source_sync_admission ADD COLUMN snapshot_run_id TEXT REFERENCES sync_runs(id) ON DELETE RESTRICT;
ALTER TABLE source_sync_admission ADD COLUMN retry_not_before INTEGER NOT NULL DEFAULT 0 CHECK (retry_not_before >= 0);
ALTER TABLE source_sync_admission ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0);
ALTER TABLE source_sync_admission ADD COLUMN stop_reason TEXT;
-- Existing failed retries retain their original ceiling; old interrupted rows
-- have no proven snapshot association and must not be treated as continuations.
UPDATE source_sync_admission SET retry_count=MIN(2,MAX(0,attempts-1)) WHERE outcome='failed';
