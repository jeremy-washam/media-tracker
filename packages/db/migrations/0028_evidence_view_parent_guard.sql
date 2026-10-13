-- Missing public parents must fail even under an outer INSERT OR IGNORE.
-- A scalar lookup yields NULL, and NOT NULL alone is suppressible by IGNORE.
DROP TRIGGER archive_evidence_view_insert;
CREATE TRIGGER archive_evidence_view_insert
INSTEAD OF INSERT ON archive_entry_evidence
BEGIN
  SELECT CASE WHEN
    NOT EXISTS(SELECT 1 FROM archive_entries WHERE id=NEW.archive_entry_id AND storage_id IS NOT NULL)
    OR NOT EXISTS(SELECT 1 FROM source_records WHERE id=NEW.source_record_id AND storage_id IS NOT NULL)
  THEN RAISE(ABORT, 'archive evidence requires existing parents') END;
  INSERT INTO archive_entry_evidence_storage(
    archive_storage_id,source_storage_id,role,id,linked_at
  ) VALUES (
    (SELECT storage_id FROM archive_entries WHERE id=NEW.archive_entry_id),
    (SELECT storage_id FROM source_records WHERE id=NEW.source_record_id),
    NEW.role,NEW.id,NEW.linked_at
  );
END;
