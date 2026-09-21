ALTER TABLE article_content_raw_acquisitions RENAME TO article_content_raw_acquisitions_legacy;

CREATE TABLE article_content_raw_acquisitions (
  id TEXT PRIMARY KEY NOT NULL,
  idempotency_key TEXT NOT NULL REFERENCES article_content_jobs(idempotency_key) ON DELETE RESTRICT,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE RESTRICT,
  readwise_document_id TEXT NOT NULL REFERENCES readwise_documents(id) ON DELETE RESTRICT,
  storage_key TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_length INTEGER NOT NULL CHECK (byte_length >= 0),
  acquired_at TEXT NOT NULL,
  processing_status TEXT NOT NULL CHECK (processing_status IN ('pending', 'processed', 'failed')),
  processing_error TEXT,
  UNIQUE(idempotency_key, attempt_number)
);

INSERT INTO article_content_raw_acquisitions(
  id,idempotency_key,attempt_number,connection_id,readwise_document_id,storage_key,sha256,
  content_type,byte_length,acquired_at,processing_status,processing_error)
SELECT idempotency_key || ':attempt:1',idempotency_key,1,connection_id,readwise_document_id,
  storage_key,sha256,content_type,byte_length,acquired_at,processing_status,processing_error
FROM article_content_raw_acquisitions_legacy;

DROP TABLE article_content_raw_acquisitions_legacy;

CREATE INDEX article_content_raw_acquisitions_document_idx
  ON article_content_raw_acquisitions(readwise_document_id, acquired_at);

CREATE INDEX article_content_raw_acquisitions_job_idx
  ON article_content_raw_acquisitions(idempotency_key, attempt_number);
