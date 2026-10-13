-- Public/domain IDs remain unchanged. Compact keys are internal references only.
-- Populate keys once: ROWID is not subsequently used as a durable identifier.
ALTER TABLE source_records ADD COLUMN storage_id INTEGER
  CHECK(storage_id IS NULL OR (typeof(storage_id) = 'integer' AND storage_id > 0));
UPDATE source_records SET storage_id = rowid;
CREATE UNIQUE INDEX source_records_storage_id_unique ON source_records(storage_id);

ALTER TABLE archive_entries ADD COLUMN storage_id INTEGER
  CHECK(storage_id IS NULL OR (typeof(storage_id) = 'integer' AND storage_id > 0));
UPDATE archive_entries SET storage_id = rowid;
CREATE UNIQUE INDEX archive_entries_storage_id_unique ON archive_entries(storage_id);

-- SQLite serializes writes; these indexed MAX lookups allocate within the same
-- insert transaction. Keys are not external IDs or lifetime allocation tokens.
CREATE TRIGGER source_records_allocate_storage_id
AFTER INSERT ON source_records WHEN NEW.storage_id IS NULL
BEGIN
  UPDATE source_records
  SET storage_id = (SELECT COALESCE(MAX(storage_id), 0) + 1 FROM source_records)
  WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER archive_entries_allocate_storage_id
AFTER INSERT ON archive_entries WHEN NEW.storage_id IS NULL
BEGIN
  UPDATE archive_entries
  SET storage_id = (SELECT COALESCE(MAX(storage_id), 0) + 1 FROM archive_entries)
  WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER source_records_storage_identity_is_immutable
BEFORE UPDATE ON source_records
WHEN NEW.id IS NOT OLD.id
  OR (OLD.storage_id IS NOT NULL AND NEW.storage_id IS NOT OLD.storage_id)
BEGIN
  SELECT RAISE(ABORT, 'source record identity and storage key are immutable');
END;
CREATE TRIGGER archive_entries_storage_identity_is_immutable
BEFORE UPDATE ON archive_entries
WHEN NEW.id IS NOT OLD.id
  OR (OLD.storage_id IS NOT NULL AND NEW.storage_id IS NOT OLD.storage_id)
BEGIN
  SELECT RAISE(ABORT, 'archive entry identity and storage key are immutable');
END;

CREATE TABLE archive_entry_evidence_storage (
  archive_storage_id INTEGER NOT NULL REFERENCES archive_entries(storage_id) ON DELETE RESTRICT,
  source_storage_id INTEGER NOT NULL REFERENCES source_records(storage_id) ON DELETE RESTRICT,
  role TEXT NOT NULL CHECK(role IN ('admission', 'occurrence_time', 'metadata', 'rating', 'review', 'removal')),
  id TEXT NOT NULL UNIQUE,
  linked_at TEXT NOT NULL,
  PRIMARY KEY(archive_storage_id, source_storage_id, role)
) WITHOUT ROWID;
CREATE INDEX archive_entry_evidence_storage_source_idx
  ON archive_entry_evidence_storage(source_storage_id);

CREATE TRIGGER archive_evidence_storage_requires_matching_connection
BEFORE INSERT ON archive_entry_evidence_storage
BEGIN
  SELECT CASE WHEN (
    SELECT connection_id FROM archive_entries WHERE storage_id = NEW.archive_storage_id
  ) IS NOT (
    SELECT connection_id FROM source_records WHERE storage_id = NEW.source_storage_id
  ) THEN RAISE(ABORT, 'archive evidence must come from the archive entry connection') END;
END;
CREATE TRIGGER archive_evidence_storage_is_immutable
BEFORE UPDATE ON archive_entry_evidence_storage
BEGIN
  SELECT RAISE(ABORT, 'archive evidence links are immutable');
END;
CREATE TRIGGER archive_evidence_storage_cannot_be_deleted
BEFORE DELETE ON archive_entry_evidence_storage
BEGIN
  SELECT RAISE(ABORT, 'archive evidence links cannot be deleted');
END;

-- Scalar lookups deliberately fail NOT NULL validation if a parent is missing;
-- an inner-join copy could otherwise silently omit evidence from a bad database.
INSERT INTO archive_entry_evidence_storage(
  archive_storage_id, source_storage_id, role, id, linked_at
)
SELECT
  (SELECT storage_id FROM archive_entries WHERE id = evidence.archive_entry_id),
  (SELECT storage_id FROM source_records WHERE id = evidence.source_record_id),
  evidence.role, evidence.id, evidence.linked_at
FROM archive_entry_evidence evidence;
DROP TABLE archive_entry_evidence;

-- Keep the complete original five-column read/write boundary for reconciliation
-- and provenance queries. No evidence ID, role, or linked_at value is discarded.
CREATE VIEW archive_entry_evidence AS
SELECT evidence.id, archive.id AS archive_entry_id, source.id AS source_record_id,
  evidence.role, evidence.linked_at
FROM archive_entry_evidence_storage evidence
JOIN archive_entries archive ON archive.storage_id = evidence.archive_storage_id
JOIN source_records source ON source.storage_id = evidence.source_storage_id;

CREATE TRIGGER archive_evidence_view_insert
INSTEAD OF INSERT ON archive_entry_evidence
BEGIN
  INSERT INTO archive_entry_evidence_storage(
    archive_storage_id, source_storage_id, role, id, linked_at
  ) VALUES (
    (SELECT storage_id FROM archive_entries WHERE id = NEW.archive_entry_id),
    (SELECT storage_id FROM source_records WHERE id = NEW.source_record_id),
    NEW.role, NEW.id, NEW.linked_at
  );
END;
CREATE TRIGGER archive_evidence_view_is_immutable
INSTEAD OF UPDATE ON archive_entry_evidence
BEGIN
  SELECT RAISE(ABORT, 'archive evidence links are immutable');
END;
CREATE TRIGGER archive_evidence_view_cannot_be_deleted
INSTEAD OF DELETE ON archive_entry_evidence
BEGIN
  SELECT RAISE(ABORT, 'archive evidence links cannot be deleted');
END;
