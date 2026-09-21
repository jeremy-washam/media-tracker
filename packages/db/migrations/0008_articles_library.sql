CREATE TABLE readwise_documents (
  id TEXT PRIMARY KEY NOT NULL,
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE RESTRICT,
  document_id TEXT NOT NULL,
  media_item_id TEXT REFERENCES media_items(id) ON DELETE RESTRICT,
  external_identity_id TEXT REFERENCES external_identities(id) ON DELETE RESTRICT,
  reader_url TEXT,
  source_url TEXT,
  raw_category TEXT NOT NULL,
  subtype TEXT CHECK (subtype IS NULL OR subtype IN ('article', 'newsletter', 'pdf', 'rss')),
  current_location TEXT NOT NULL,
  upstream_state TEXT NOT NULL CHECK (upstream_state IN ('active', 'removed', 'unknown')),
  title TEXT,
  normalized_title TEXT,
  author TEXT,
  author_key TEXT,
  publication TEXT,
  publication_key TEXT,
  acquisition_source TEXT,
  summary TEXT,
  image_url TEXT,
  document_note TEXT,
  word_count INTEGER CHECK (word_count IS NULL OR word_count >= 0),
  reading_time_raw TEXT,
  reading_time_minutes REAL CHECK (reading_time_minutes IS NULL OR reading_time_minutes >= 0),
  reading_time_parser_version INTEGER NOT NULL,
  listening_time_raw TEXT,
  reading_progress REAL,
  progress_valid INTEGER NOT NULL CHECK (progress_valid IN (0, 1)),
  published_at_value TEXT,
  published_at_precision TEXT,
  published_at_basis TEXT,
  created_at_source TEXT,
  saved_at TEXT,
  first_opened_at TEXT,
  last_opened_at TEXT,
  last_moved_at TEXT,
  updated_at_source TEXT,
  last_source_record_id TEXT NOT NULL REFERENCES source_records(id) ON DELETE RESTRICT,
  last_observed_at TEXT NOT NULL,
  last_snapshot_run_id TEXT REFERENCES sync_runs(id) ON DELETE RESTRICT,
  projection_version INTEGER NOT NULL,
  UNIQUE (connection_id, document_id),
  CHECK (
    (published_at_value IS NULL AND published_at_precision IS NULL AND published_at_basis IS NULL)
    OR
    (published_at_value IS NOT NULL
      AND published_at_precision IN ('year', 'month', 'day', 'instant')
      AND published_at_basis IN ('source_asserted', 'inferred'))
  )
);
CREATE INDEX readwise_documents_media_connection_idx
  ON readwise_documents(media_item_id, connection_id);
CREATE INDEX readwise_documents_location_idx
  ON readwise_documents(connection_id, current_location, upstream_state, saved_at DESC, media_item_id);
CREATE INDEX readwise_documents_subtype_idx
  ON readwise_documents(connection_id, subtype, current_location, media_item_id);
CREATE INDEX readwise_documents_author_idx
  ON readwise_documents(current_location, author_key, media_item_id);
CREATE INDEX readwise_documents_publication_idx
  ON readwise_documents(current_location, publication_key, media_item_id);

CREATE TABLE readwise_projection_state (
  connection_id TEXT PRIMARY KEY NOT NULL REFERENCES connections(id) ON DELETE RESTRICT,
  documents_snapshot_run_id TEXT REFERENCES sync_runs(id) ON DELETE RESTRICT,
  documents_snapshot_completed_at TEXT,
  documents_parser_version TEXT,
  incremental_watermark TEXT,
  tags_snapshot_run_id TEXT REFERENCES sync_runs(id) ON DELETE RESTRICT,
  tags_snapshot_completed_at TEXT,
  highlights_snapshot_run_id TEXT REFERENCES sync_runs(id) ON DELETE RESTRICT,
  highlights_snapshot_completed_at TEXT,
  highlights_parser_version TEXT,
  full_text_policy TEXT NOT NULL DEFAULT 'archive_queue'
    CHECK (full_text_policy IN ('archive_queue', 'disabled')),
  content_acquisition_version INTEGER NOT NULL DEFAULT 1,
  content_index_version INTEGER NOT NULL DEFAULT 1,
  projection_run_id TEXT REFERENCES sync_runs(id) ON DELETE RESTRICT,
  projection_rebuilt_at TEXT,
  projection_version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE readwise_tags (
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE RESTRICT,
  tag_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  source_record_id TEXT NOT NULL REFERENCES source_records(id) ON DELETE RESTRICT,
  upstream_state TEXT NOT NULL CHECK (upstream_state IN ('active', 'removed', 'unknown')),
  first_observed_at TEXT NOT NULL,
  last_observed_at TEXT NOT NULL,
  PRIMARY KEY (connection_id, tag_key)
);

CREATE TABLE readwise_document_tags (
  readwise_document_id TEXT NOT NULL REFERENCES readwise_documents(id) ON DELETE RESTRICT,
  tag_key TEXT NOT NULL,
  source_type TEXT,
  created_value TEXT,
  upstream_state TEXT NOT NULL CHECK (upstream_state IN ('active', 'removed', 'unknown')),
  source_record_id TEXT NOT NULL REFERENCES source_records(id) ON DELETE RESTRICT,
  first_observed_at TEXT NOT NULL,
  last_observed_at TEXT NOT NULL,
  PRIMARY KEY (readwise_document_id, tag_key)
);
CREATE INDEX readwise_document_tags_key_idx
  ON readwise_document_tags(tag_key, readwise_document_id);

CREATE TABLE readwise_highlight_containers (
  id TEXT PRIMARY KEY NOT NULL,
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE RESTRICT,
  user_book_id INTEGER NOT NULL,
  external_id TEXT,
  readwise_document_id TEXT REFERENCES readwise_documents(id) ON DELETE RESTRICT,
  title TEXT,
  author TEXT,
  source TEXT,
  category TEXT,
  source_url TEXT,
  document_note TEXT,
  upstream_state TEXT NOT NULL CHECK (upstream_state IN ('active', 'removed', 'unknown')),
  source_record_id TEXT NOT NULL REFERENCES source_records(id) ON DELETE RESTRICT,
  source_updated_at TEXT,
  last_observed_at TEXT NOT NULL,
  UNIQUE (connection_id, user_book_id)
);
CREATE INDEX readwise_highlight_containers_document_idx
  ON readwise_highlight_containers(readwise_document_id, upstream_state);

CREATE TABLE readwise_highlights (
  id TEXT PRIMARY KEY NOT NULL,
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE RESTRICT,
  highlight_id INTEGER NOT NULL,
  container_id TEXT NOT NULL REFERENCES readwise_highlight_containers(id) ON DELETE RESTRICT,
  text TEXT,
  note TEXT,
  location INTEGER,
  end_location INTEGER,
  location_type TEXT,
  color TEXT,
  is_favorite INTEGER NOT NULL CHECK (is_favorite IN (0, 1)),
  is_discard INTEGER NOT NULL CHECK (is_discard IN (0, 1)),
  upstream_state TEXT NOT NULL CHECK (upstream_state IN ('active', 'removed', 'unknown')),
  highlighted_at TEXT,
  created_at_source TEXT,
  updated_at_source TEXT,
  reader_url TEXT,
  source_record_id TEXT NOT NULL REFERENCES source_records(id) ON DELETE RESTRICT,
  last_observed_at TEXT NOT NULL,
  UNIQUE (connection_id, highlight_id)
);
CREATE INDEX readwise_highlights_container_idx
  ON readwise_highlights(container_id, upstream_state, is_discard, location_type, location, highlight_id);

CREATE TABLE article_content_manifests (
  id TEXT PRIMARY KEY NOT NULL,
  readwise_document_id TEXT NOT NULL REFERENCES readwise_documents(id) ON DELETE RESTRICT,
  media_item_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE RESTRICT,
  content_kind TEXT NOT NULL CHECK (content_kind = 'reader_html'),
  raw_object_key TEXT NOT NULL,
  raw_sha256 TEXT NOT NULL,
  extracted_object_key TEXT NOT NULL,
  extracted_sha256 TEXT NOT NULL,
  source_updated_at TEXT,
  extraction_version INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending', 'ready', 'failed', 'expired')),
  coverage TEXT NOT NULL CHECK (coverage IN ('full', 'partial')),
  language TEXT,
  acquired_at TEXT NOT NULL,
  processed_at TEXT,
  policy_version INTEGER NOT NULL,
  failure_class TEXT,
  UNIQUE (readwise_document_id, source_updated_at, extraction_version)
);

CREATE TABLE article_content_chunks (
  manifest_id TEXT NOT NULL REFERENCES article_content_manifests(id) ON DELETE RESTRICT,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  byte_start INTEGER NOT NULL CHECK (byte_start >= 0),
  byte_length INTEGER NOT NULL CHECK (byte_length >= 0),
  sha256 TEXT NOT NULL,
  PRIMARY KEY (manifest_id, ordinal)
);

CREATE TABLE article_library_projection (
  media_item_id TEXT PRIMARY KEY NOT NULL REFERENCES media_items(id) ON DELETE RESTRICT,
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE RESTRICT,
  readwise_document_id TEXT NOT NULL REFERENCES readwise_documents(id) ON DELETE RESTRICT,
  display_title TEXT NOT NULL,
  imported_title TEXT,
  normalized_title TEXT NOT NULL,
  subtype TEXT NOT NULL CHECK (subtype IN ('article', 'newsletter', 'pdf', 'rss')),
  image_url TEXT,
  author TEXT,
  author_key TEXT,
  publication TEXT,
  publication_key TEXT,
  published_at_value TEXT,
  published_at_precision TEXT,
  reading_time_raw TEXT,
  reading_time_minutes REAL,
  reading_progress REAL,
  progress_valid INTEGER NOT NULL CHECK (progress_valid IN (0, 1)),
  opened INTEGER NOT NULL CHECK (opened IN (0, 1)),
  in_archive INTEGER NOT NULL CHECK (in_archive IN (0, 1)),
  archive_occurrence_count INTEGER NOT NULL CHECK (archive_occurrence_count >= 0),
  latest_archive_at TEXT,
  has_unknown_archive_date INTEGER NOT NULL CHECK (has_unknown_archive_date IN (0, 1)),
  in_queue INTEGER NOT NULL CHECK (in_queue IN (0, 1)),
  queue_state TEXT CHECK (queue_state IS NULL OR queue_state IN ('inbox', 'later', 'shortlist')),
  queue_inbox INTEGER NOT NULL CHECK (queue_inbox IN (0, 1)),
  queue_later INTEGER NOT NULL CHECK (queue_later IN (0, 1)),
  queue_shortlist INTEGER NOT NULL CHECK (queue_shortlist IN (0, 1)),
  queue_added_at TEXT,
  in_feed INTEGER NOT NULL CHECK (in_feed IN (0, 1)),
  feed_arrived_at TEXT,
  current_location TEXT NOT NULL,
  tag_count INTEGER NOT NULL CHECK (tag_count >= 0),
  active_highlight_count INTEGER NOT NULL CHECK (active_highlight_count >= 0),
  content_available INTEGER NOT NULL CHECK (content_available IN (0, 1)),
  source_refreshed_at TEXT NOT NULL,
  projection_version INTEGER NOT NULL
);
CREATE INDEX article_library_archive_idx
  ON article_library_projection(in_archive, latest_archive_at DESC, normalized_title, media_item_id);
CREATE INDEX article_library_queue_idx
  ON article_library_projection(in_queue, queue_added_at DESC, normalized_title, media_item_id);
CREATE INDEX article_library_feed_idx
  ON article_library_projection(in_feed, feed_arrived_at DESC, normalized_title, media_item_id);
CREATE INDEX article_library_subtype_idx
  ON article_library_projection(subtype, normalized_title, media_item_id);
CREATE INDEX article_library_author_idx
  ON article_library_projection(author_key, normalized_title, media_item_id);
CREATE INDEX article_library_publication_idx
  ON article_library_projection(publication_key, normalized_title, media_item_id);
CREATE INDEX article_library_reading_time_idx
  ON article_library_projection(reading_time_minutes, normalized_title, media_item_id);
CREATE INDEX article_library_progress_idx
  ON article_library_projection(reading_progress, normalized_title, media_item_id);

CREATE VIRTUAL TABLE article_search USING fts5(
  media_item_id UNINDEXED,
  title,
  author,
  publication,
  summary,
  document_notes,
  highlight_text,
  highlight_notes,
  tokenize='unicode61 remove_diacritics 2'
);

CREATE VIRTUAL TABLE article_content_search USING fts5(
  manifest_id UNINDEXED,
  chunk_ordinal UNINDEXED,
  content,
  tokenize='unicode61 remove_diacritics 2',
  content=''
);
