-- Evidence is append-or-replay under every INSERT conflict policy. A valid
-- existing pair/role is always a no-op, preserving its original ID and timestamp,
-- including ordinary INSERT and INSERT OR REPLACE. SQLite does not expose an
-- outer conflict policy to triggers; this explicit replay rule closes REPLACE's
-- implicit-delete path even when recursive_triggers is disabled.
--
-- A new pair/role cannot reuse another link's ID, even under INSERT OR IGNORE.
-- If the pair/role already exists, replay wins before incoming ID collision
-- checks, matching canonical targeted ON CONFLICT and reconciliation IGNORE:
-- no retained link is changed, regardless of the incoming ID or timestamp.
-- Invalid parents/connection lineage are rejected before replay. NULL ID/time
-- still reach the table's original NOT NULL constraints rather than becoming
-- valid replay. No retained evidence rows or values are rewritten.
DROP TRIGGER archive_evidence_storage_requires_matching_connection;
CREATE TRIGGER archive_evidence_storage_requires_matching_connection
BEFORE INSERT ON archive_entry_evidence_storage
BEGIN
  SELECT CASE WHEN
    NOT EXISTS(SELECT 1 FROM archive_entries WHERE storage_id=NEW.archive_storage_id)
    OR NOT EXISTS(SELECT 1 FROM source_records WHERE storage_id=NEW.source_storage_id)
  THEN RAISE(ABORT, 'archive evidence requires existing parents') END;
  SELECT CASE WHEN (
    SELECT connection_id FROM archive_entries WHERE storage_id=NEW.archive_storage_id
  ) IS NOT (
    SELECT connection_id FROM source_records WHERE storage_id=NEW.source_storage_id
  ) THEN RAISE(ABORT, 'archive evidence must come from the archive entry connection') END;
  SELECT CASE WHEN NEW.id IS NOT NULL AND NEW.linked_at IS NOT NULL AND EXISTS (
    SELECT 1 FROM archive_entry_evidence_storage
    WHERE archive_storage_id=NEW.archive_storage_id
      AND source_storage_id=NEW.source_storage_id AND role=NEW.role
  ) THEN RAISE(IGNORE) END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM archive_entry_evidence_storage WHERE id=NEW.id
  ) AND NOT EXISTS (
    SELECT 1 FROM archive_entry_evidence_storage
    WHERE archive_storage_id=NEW.archive_storage_id
      AND source_storage_id=NEW.source_storage_id AND role=NEW.role
  ) THEN RAISE(ABORT, 'UNIQUE evidence ID already identifies another role link') END;
END;
