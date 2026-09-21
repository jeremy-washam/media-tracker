ALTER TABLE article_content_jobs ADD COLUMN updated_at TEXT;
ALTER TABLE article_content_jobs ADD COLUMN last_attempt_at TEXT;
ALTER TABLE article_content_jobs ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;

UPDATE article_content_jobs SET updated_at=created_at WHERE updated_at IS NULL;

CREATE TABLE article_content_raw_acquisitions (
  idempotency_key TEXT PRIMARY KEY NOT NULL,
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE RESTRICT,
  readwise_document_id TEXT NOT NULL REFERENCES readwise_documents(id) ON DELETE RESTRICT,
  storage_key TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_length INTEGER NOT NULL CHECK (byte_length >= 0),
  acquired_at TEXT NOT NULL,
  processing_status TEXT NOT NULL CHECK (processing_status IN ('pending', 'processed', 'failed')),
  processing_error TEXT
);

CREATE INDEX article_content_raw_acquisitions_document_idx
  ON article_content_raw_acquisitions(readwise_document_id, acquired_at);
