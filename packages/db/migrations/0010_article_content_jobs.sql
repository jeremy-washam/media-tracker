CREATE TABLE article_content_jobs (
  idempotency_key TEXT PRIMARY KEY NOT NULL,
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE RESTRICT,
  readwise_document_id TEXT NOT NULL REFERENCES readwise_documents(id) ON DELETE RESTRICT,
  document_id TEXT NOT NULL,
  source_updated_at TEXT,
  reservation_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
  created_at TEXT NOT NULL,
  completed_at TEXT,
  failure_class TEXT
);
CREATE INDEX article_content_jobs_status_idx
  ON article_content_jobs(connection_id, status, created_at);
