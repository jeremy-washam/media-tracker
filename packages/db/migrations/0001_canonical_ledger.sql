PRAGMA foreign_keys = ON;

CREATE TABLE sources (
  source TEXT PRIMARY KEY NOT NULL CHECK (source IN ('readwise', 'hardcover', 'letterboxd', 'spotify', 'youtube')),
  display_name TEXT NOT NULL
);

INSERT INTO sources (source, display_name) VALUES
  ('readwise', 'Readwise Reader'),
  ('hardcover', 'Hardcover'),
  ('letterboxd', 'Letterboxd'),
  ('spotify', 'Spotify'),
  ('youtube', 'YouTube');

CREATE TABLE connections (
  id TEXT PRIMARY KEY NOT NULL,
  source TEXT NOT NULL REFERENCES sources(source) ON DELETE RESTRICT ON UPDATE RESTRICT,
  label TEXT NOT NULL CHECK (length(trim(label)) > 0),
  status TEXT NOT NULL CHECK (status IN ('connected', 'disconnected', 'degraded', 'reauthorization_required')),
  coverage TEXT NOT NULL CHECK (coverage IN ('complete', 'partial', 'best_effort')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sync_runs (
  id TEXT PRIMARY KEY NOT NULL,
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN ('backfill', 'reconcile', 'import', 'webhook', 'replay')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'succeeded', 'partially_succeeded', 'failed')),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  raw_object_count INTEGER NOT NULL DEFAULT 0 CHECK (raw_object_count >= 0),
  source_record_count INTEGER NOT NULL DEFAULT 0 CHECK (source_record_count >= 0),
  normalized_record_count INTEGER NOT NULL DEFAULT 0 CHECK (normalized_record_count >= 0),
  failed_record_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_record_count >= 0),
  error_code TEXT,
  error_message TEXT
);
CREATE INDEX sync_runs_connection_started_idx ON sync_runs(connection_id, started_at);

CREATE TABLE sync_cursors (
  id TEXT PRIMARY KEY NOT NULL,
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  checkpoint_json TEXT NOT NULL CHECK (json_valid(checkpoint_json) AND json_type(checkpoint_json) = 'object'),
  committed_at TEXT NOT NULL,
  sync_run_id TEXT NOT NULL REFERENCES sync_runs(id) ON DELETE RESTRICT,
  UNIQUE (connection_id, name)
);

CREATE TABLE raw_objects (
  id TEXT PRIMARY KEY NOT NULL,
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE RESTRICT,
  sync_run_id TEXT NOT NULL REFERENCES sync_runs(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN ('api_page', 'webhook', 'rss', 'export', 'source_document')),
  acquisition_key TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  content_type TEXT NOT NULL,
  byte_length INTEGER NOT NULL CHECK (byte_length >= 0),
  acquired_at TEXT NOT NULL,
  processing_status TEXT NOT NULL CHECK (processing_status IN ('pending', 'processing', 'processed', 'failed')),
  last_parser_version TEXT,
  processing_error TEXT,
  UNIQUE (connection_id, acquisition_key),
  UNIQUE (id, connection_id)
);
CREATE INDEX raw_objects_sync_run_idx ON raw_objects(sync_run_id);

CREATE TABLE source_records (
  id TEXT PRIMARY KEY NOT NULL,
  raw_object_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  record_type TEXT NOT NULL,
  record_path TEXT NOT NULL,
  source_record_key TEXT,
  source_recorded_at_value TEXT,
  source_recorded_at_precision TEXT,
  source_recorded_at_basis TEXT,
  observed_at TEXT NOT NULL,
  parser_version TEXT NOT NULL,
  content_sha256 TEXT,
  disposition TEXT NOT NULL CHECK (disposition IN ('normalized', 'ignored', 'unresolved', 'invalid')),
  upstream_state TEXT NOT NULL CHECK (upstream_state IN ('active', 'removed', 'unknown')),
  error_code TEXT,
  FOREIGN KEY (raw_object_id, connection_id) REFERENCES raw_objects(id, connection_id) ON DELETE RESTRICT,
  UNIQUE (raw_object_id, parser_version, record_path),
  CHECK (
    (source_recorded_at_value IS NULL AND source_recorded_at_precision IS NULL AND source_recorded_at_basis IS NULL)
    OR
    (source_recorded_at_value IS NOT NULL
      AND source_recorded_at_precision IN ('year', 'month', 'day', 'instant')
      AND source_recorded_at_basis IN ('source_asserted', 'inferred'))
  )
);
CREATE INDEX source_records_logical_key_idx ON source_records(connection_id, source_record_key);

CREATE TABLE media_items (
  id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('article', 'video', 'podcast_episode', 'movie', 'book', 'song')),
  title TEXT,
  subtitle TEXT,
  primary_creator_name TEXT,
  description TEXT,
  canonical_url TEXT,
  image_url TEXT,
  published_at_value TEXT,
  published_at_precision TEXT,
  published_at_basis TEXT,
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (published_at_value IS NULL AND published_at_precision IS NULL AND published_at_basis IS NULL)
    OR
    (published_at_value IS NOT NULL
      AND published_at_precision IN ('year', 'month', 'day', 'instant')
      AND published_at_basis IN ('source_asserted', 'inferred'))
  )
);
CREATE INDEX media_items_type_updated_idx ON media_items(type, updated_at);

CREATE TABLE external_identities (
  id TEXT PRIMARY KEY NOT NULL,
  media_item_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE RESTRICT,
  namespace TEXT NOT NULL CHECK (namespace IN ('readwise', 'hardcover', 'letterboxd', 'spotify', 'youtube', 'tmdb', 'isbn', 'asin')),
  external_type TEXT NOT NULL,
  external_id TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('global', 'connection')),
  connection_id TEXT REFERENCES connections(id) ON DELETE RESTRICT,
  canonical_url TEXT,
  first_observed_source_record_id TEXT NOT NULL REFERENCES source_records(id) ON DELETE RESTRICT,
  last_observed_source_record_id TEXT NOT NULL REFERENCES source_records(id) ON DELETE RESTRICT,
  retired_at TEXT,
  UNIQUE (id, media_item_id),
  CHECK (
    (scope = 'global' AND connection_id IS NULL)
    OR (scope = 'connection' AND connection_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX external_identities_global_unique
  ON external_identities(namespace, external_type, external_id)
  WHERE scope = 'global';
CREATE UNIQUE INDEX external_identities_connection_unique
  ON external_identities(connection_id, namespace, external_type, external_id)
  WHERE scope = 'connection';
CREATE INDEX external_identities_media_item_idx ON external_identities(media_item_id);

CREATE TABLE archive_entries (
  id TEXT PRIMARY KEY NOT NULL,
  media_item_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE RESTRICT,
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE RESTRICT,
  consumed_identity_id TEXT,
  source_occurrence_key TEXT NOT NULL,
  admission_reason TEXT NOT NULL CHECK (admission_reason IN (
    'readwise_archive_state',
    'hardcover_read_status',
    'hardcover_finished_read',
    'letterboxd_watched_state',
    'letterboxd_diary_entry',
    'spotify_positive_playback',
    'spotify_positive_resume_position',
    'spotify_fully_played',
    'youtube_watched_activity'
  )),
  consumed_at_value TEXT,
  consumed_at_precision TEXT,
  consumed_at_basis TEXT,
  source_recorded_at_value TEXT,
  source_recorded_at_precision TEXT,
  source_recorded_at_basis TEXT,
  rating_value REAL,
  rating_scale_minimum REAL,
  rating_scale_maximum REAL,
  review_text TEXT,
  upstream_state TEXT NOT NULL CHECK (upstream_state IN ('active', 'removed', 'unknown')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (consumed_identity_id, media_item_id)
    REFERENCES external_identities(id, media_item_id) ON DELETE RESTRICT,
  UNIQUE (connection_id, source_occurrence_key),
  CHECK (
    (consumed_at_value IS NULL AND consumed_at_precision IS NULL AND consumed_at_basis IS NULL)
    OR
    (consumed_at_value IS NOT NULL
      AND consumed_at_precision IN ('year', 'month', 'day', 'instant')
      AND consumed_at_basis IN ('source_asserted', 'inferred'))
  ),
  CHECK (
    (source_recorded_at_value IS NULL AND source_recorded_at_precision IS NULL AND source_recorded_at_basis IS NULL)
    OR
    (source_recorded_at_value IS NOT NULL
      AND source_recorded_at_precision IN ('year', 'month', 'day', 'instant')
      AND source_recorded_at_basis IN ('source_asserted', 'inferred'))
  ),
  CHECK (
    (rating_value IS NULL AND rating_scale_minimum IS NULL AND rating_scale_maximum IS NULL)
    OR
    (rating_value IS NOT NULL
      AND rating_scale_minimum IS NOT NULL
      AND rating_scale_maximum IS NOT NULL
      AND rating_scale_minimum < rating_scale_maximum
      AND rating_value BETWEEN rating_scale_minimum AND rating_scale_maximum)
  )
);
CREATE INDEX archive_entries_media_consumed_idx ON archive_entries(media_item_id, consumed_at_value);

CREATE TABLE archive_entry_evidence (
  id TEXT PRIMARY KEY NOT NULL,
  archive_entry_id TEXT NOT NULL REFERENCES archive_entries(id) ON DELETE RESTRICT,
  source_record_id TEXT NOT NULL REFERENCES source_records(id) ON DELETE RESTRICT,
  role TEXT NOT NULL CHECK (role IN ('admission', 'occurrence_time', 'metadata', 'rating', 'review', 'removal')),
  linked_at TEXT NOT NULL,
  UNIQUE (archive_entry_id, source_record_id, role)
);
CREATE INDEX archive_entry_evidence_source_record_idx ON archive_entry_evidence(source_record_id);

CREATE TRIGGER sync_cursors_require_successful_run_insert
BEFORE INSERT ON sync_cursors
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM sync_runs
    WHERE id = NEW.sync_run_id
      AND connection_id = NEW.connection_id
      AND status = 'succeeded'
  ) THEN RAISE(ABORT, 'cursor requires a succeeded sync run for the same connection') END;
END;

CREATE TRIGGER sync_cursors_require_successful_run_update
BEFORE UPDATE ON sync_cursors
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM sync_runs
    WHERE id = NEW.sync_run_id
      AND connection_id = NEW.connection_id
      AND status = 'succeeded'
  ) THEN RAISE(ABORT, 'cursor requires a succeeded sync run for the same connection') END;
END;

CREATE TRIGGER archive_evidence_requires_matching_connection
BEFORE INSERT ON archive_entry_evidence
BEGIN
  SELECT CASE WHEN (
    SELECT connection_id FROM archive_entries WHERE id = NEW.archive_entry_id
  ) IS NOT (
    SELECT connection_id FROM source_records WHERE id = NEW.source_record_id
  ) THEN RAISE(ABORT, 'archive evidence must come from the archive entry connection') END;
END;

CREATE TRIGGER archive_evidence_is_immutable
BEFORE UPDATE ON archive_entry_evidence
BEGIN
  SELECT RAISE(ABORT, 'archive evidence links are immutable');
END;

CREATE TRIGGER archive_evidence_cannot_be_deleted
BEFORE DELETE ON archive_entry_evidence
BEGIN
  SELECT RAISE(ABORT, 'archive evidence links cannot be deleted');
END;
