CREATE TABLE queue_entries (
  id TEXT PRIMARY KEY NOT NULL,
  media_item_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE RESTRICT,
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE RESTRICT,
  source_membership_key TEXT NOT NULL,
  relationship_type TEXT NOT NULL,
  added_at_value TEXT,
  added_at_precision TEXT,
  added_at_basis TEXT,
  upstream_state TEXT NOT NULL CHECK (upstream_state IN ('active', 'removed', 'unknown')),
  first_observed_at TEXT NOT NULL,
  last_observed_at TEXT NOT NULL,
  retired_observed_at TEXT,
  projection_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (connection_id, source_membership_key),
  CHECK (
    (added_at_value IS NULL AND added_at_precision IS NULL AND added_at_basis IS NULL)
    OR
    (added_at_value IS NOT NULL
      AND added_at_precision IN ('year', 'month', 'day', 'instant')
      AND added_at_basis IN ('source_asserted', 'inferred'))
  )
);
CREATE INDEX queue_entries_media_state_idx
  ON queue_entries(media_item_id, upstream_state);
CREATE INDEX queue_entries_connection_added_idx
  ON queue_entries(connection_id, upstream_state, added_at_value DESC, media_item_id);

CREATE TABLE queue_entry_evidence (
  id TEXT PRIMARY KEY NOT NULL,
  queue_entry_id TEXT NOT NULL REFERENCES queue_entries(id) ON DELETE RESTRICT,
  source_record_id TEXT NOT NULL REFERENCES source_records(id) ON DELETE RESTRICT,
  role TEXT NOT NULL CHECK (role IN ('membership', 'added_time', 'removal')),
  linked_at TEXT NOT NULL,
  UNIQUE (queue_entry_id, source_record_id, role)
);
CREATE INDEX queue_entry_evidence_source_idx
  ON queue_entry_evidence(source_record_id);

CREATE TABLE letterboxd_movie_state (
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE RESTRICT,
  media_item_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE RESTRICT,
  film_uri TEXT NOT NULL,
  imported_title TEXT NOT NULL,
  release_year TEXT NOT NULL,
  current_rating_value REAL,
  rating_source_record_id TEXT REFERENCES source_records(id) ON DELETE RESTRICT,
  liked INTEGER NOT NULL CHECK (liked IN (0, 1)),
  like_source_record_id TEXT REFERENCES source_records(id) ON DELETE RESTRICT,
  last_complete_export_raw_object_id TEXT NOT NULL REFERENCES raw_objects(id) ON DELETE RESTRICT,
  first_observed_at TEXT NOT NULL,
  last_observed_at TEXT NOT NULL,
  PRIMARY KEY (connection_id, media_item_id),
  UNIQUE (connection_id, film_uri),
  CHECK (current_rating_value IS NULL OR
    (current_rating_value >= 0.5 AND current_rating_value <= 5 AND current_rating_value * 2 = CAST(current_rating_value * 2 AS INTEGER)))
);
CREATE INDEX letterboxd_movie_state_rating_idx
  ON letterboxd_movie_state(current_rating_value, media_item_id);

CREATE TABLE letterboxd_movie_viewings (
  archive_entry_id TEXT PRIMARY KEY NOT NULL REFERENCES archive_entries(id) ON DELETE RESTRICT,
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE RESTRICT,
  media_item_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE RESTRICT,
  diary_uri TEXT,
  rewatch INTEGER NOT NULL CHECK (rewatch IN (0, 1)),
  log_url TEXT,
  source_record_id TEXT NOT NULL REFERENCES source_records(id) ON DELETE RESTRICT,
  projection_version INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX letterboxd_movie_viewings_media_idx
  ON letterboxd_movie_viewings(media_item_id, archive_entry_id);

CREATE TABLE movie_library_projection (
  media_item_id TEXT PRIMARY KEY NOT NULL REFERENCES media_items(id) ON DELETE RESTRICT,
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE RESTRICT,
  film_uri TEXT NOT NULL,
  imported_title TEXT NOT NULL,
  display_title TEXT NOT NULL,
  normalized_title TEXT NOT NULL,
  release_year TEXT,
  poster_url TEXT,
  director_names TEXT,
  runtime_minutes INTEGER CHECK (runtime_minutes IS NULL OR runtime_minutes >= 0),
  current_rating_value REAL,
  liked INTEGER NOT NULL CHECK (liked IN (0, 1)),
  reviewed INTEGER NOT NULL CHECK (reviewed IN (0, 1)),
  in_archive INTEGER NOT NULL CHECK (in_archive IN (0, 1)),
  in_queue INTEGER NOT NULL CHECK (in_queue IN (0, 1)),
  queue_added_on TEXT,
  latest_known_watched_on TEXT,
  active_watch_count INTEGER NOT NULL CHECK (active_watch_count >= 0),
  has_unknown_watched_date INTEGER NOT NULL CHECK (has_unknown_watched_date IN (0, 1)),
  source_refreshed_at TEXT NOT NULL,
  projection_version INTEGER NOT NULL
);
CREATE INDEX movie_library_archive_watched_idx
  ON movie_library_projection(in_archive, latest_known_watched_on DESC, normalized_title, media_item_id);
CREATE INDEX movie_library_archive_title_idx
  ON movie_library_projection(in_archive, normalized_title, media_item_id);
CREATE INDEX movie_library_archive_year_idx
  ON movie_library_projection(in_archive, release_year DESC, normalized_title, media_item_id);
CREATE INDEX movie_library_archive_rating_idx
  ON movie_library_projection(in_archive, current_rating_value DESC, normalized_title, media_item_id);
CREATE INDEX movie_library_archive_count_idx
  ON movie_library_projection(in_archive, active_watch_count DESC, normalized_title, media_item_id);
CREATE INDEX movie_library_queue_added_idx
  ON movie_library_projection(in_queue, queue_added_on DESC, normalized_title, media_item_id);
CREATE INDEX movie_library_queue_title_idx
  ON movie_library_projection(in_queue, normalized_title, media_item_id);

CREATE VIRTUAL TABLE movie_search USING fts5(
  media_item_id UNINDEXED,
  title,
  reviews,
  tokenize='unicode61 remove_diacritics 2'
);
