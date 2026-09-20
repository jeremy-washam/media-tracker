CREATE TABLE hardcover_book_works (
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE RESTRICT,
  work_id INTEGER NOT NULL,
  media_item_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE RESTRICT,
  canonical_work_id INTEGER,
  title TEXT NOT NULL,
  subtitle TEXT,
  description TEXT,
  slug TEXT,
  pages INTEGER,
  audio_seconds INTEGER,
  release_date TEXT,
  release_precision TEXT CHECK (release_precision IS NULL OR release_precision IN ('year', 'month', 'day')),
  cover_url TEXT,
  cover_color TEXT,
  community_rating REAL,
  community_ratings_count INTEGER NOT NULL DEFAULT 0,
  users_read_count INTEGER NOT NULL DEFAULT 0,
  default_cover_edition_id INTEGER,
  source_record_id TEXT NOT NULL REFERENCES source_records(id) ON DELETE RESTRICT,
  source_updated_at TEXT,
  last_seen_run_id TEXT NOT NULL REFERENCES sync_runs(id) ON DELETE RESTRICT,
  upstream_state TEXT NOT NULL CHECK (upstream_state IN ('active', 'removed', 'unknown')),
  first_observed_at TEXT NOT NULL,
  last_observed_at TEXT NOT NULL,
  retired_at TEXT,
  PRIMARY KEY (connection_id, work_id),
  UNIQUE (connection_id, media_item_id),
  CHECK (pages IS NULL OR pages >= 0),
  CHECK (audio_seconds IS NULL OR audio_seconds >= 0),
  CHECK (community_rating IS NULL OR community_rating BETWEEN 0 AND 5),
  CHECK (community_ratings_count >= 0),
  CHECK (users_read_count >= 0)
);
CREATE INDEX hardcover_book_works_media_idx ON hardcover_book_works(media_item_id);

CREATE TABLE hardcover_user_books (
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE RESTRICT,
  user_book_id INTEGER NOT NULL,
  media_item_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE RESTRICT,
  work_id INTEGER NOT NULL,
  current_edition_id INTEGER,
  status_id INTEGER NOT NULL,
  status_label TEXT,
  date_added TEXT,
  read_count INTEGER NOT NULL DEFAULT 0,
  personal_rating REAL,
  review_text TEXT,
  review_has_spoilers INTEGER NOT NULL DEFAULT 0 CHECK (review_has_spoilers IN (0, 1)),
  source_updated_at TEXT,
  source_record_id TEXT NOT NULL REFERENCES source_records(id) ON DELETE RESTRICT,
  last_seen_run_id TEXT NOT NULL REFERENCES sync_runs(id) ON DELETE RESTRICT,
  upstream_state TEXT NOT NULL CHECK (upstream_state IN ('active', 'removed', 'unknown')),
  first_observed_at TEXT NOT NULL,
  last_observed_at TEXT NOT NULL,
  retired_at TEXT,
  PRIMARY KEY (connection_id, user_book_id),
  UNIQUE (connection_id, work_id),
  CHECK (status_id IN (1, 2, 3)),
  CHECK (read_count >= 0),
  CHECK (personal_rating IS NULL OR personal_rating BETWEEN 0 AND 5)
);
CREATE INDEX hardcover_user_books_status_idx ON hardcover_user_books(connection_id, upstream_state, status_id, date_added);
CREATE INDEX hardcover_user_books_media_idx ON hardcover_user_books(media_item_id);

CREATE TABLE hardcover_book_editions (
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE RESTRICT,
  edition_id INTEGER NOT NULL,
  media_item_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE RESTRICT,
  work_id INTEGER NOT NULL,
  canonical_edition_id INTEGER,
  title TEXT,
  subtitle TEXT,
  edition_information TEXT,
  reading_format_id INTEGER,
  reading_format TEXT,
  raw_format TEXT,
  pages INTEGER,
  audio_seconds INTEGER,
  release_date TEXT,
  publisher TEXT,
  language TEXT,
  isbn_10 TEXT,
  isbn_13 TEXT,
  asin TEXT,
  cover_url TEXT,
  cover_color TEXT,
  source_record_id TEXT NOT NULL REFERENCES source_records(id) ON DELETE RESTRICT,
  last_seen_run_id TEXT NOT NULL REFERENCES sync_runs(id) ON DELETE RESTRICT,
  upstream_state TEXT NOT NULL CHECK (upstream_state IN ('active', 'removed', 'unknown')),
  first_observed_at TEXT NOT NULL,
  last_observed_at TEXT NOT NULL,
  retired_at TEXT,
  PRIMARY KEY (connection_id, edition_id),
  CHECK (pages IS NULL OR pages >= 0),
  CHECK (audio_seconds IS NULL OR audio_seconds >= 0)
);
CREATE INDEX hardcover_book_editions_media_idx ON hardcover_book_editions(media_item_id);
CREATE INDEX hardcover_book_editions_format_idx ON hardcover_book_editions(connection_id, reading_format);

CREATE TABLE hardcover_contributors (
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE RESTRICT,
  contributor_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  slug TEXT,
  source_record_id TEXT NOT NULL REFERENCES source_records(id) ON DELETE RESTRICT,
  last_seen_run_id TEXT NOT NULL REFERENCES sync_runs(id) ON DELETE RESTRICT,
  upstream_state TEXT NOT NULL CHECK (upstream_state IN ('active', 'removed', 'unknown')),
  first_observed_at TEXT NOT NULL,
  last_observed_at TEXT NOT NULL,
  retired_at TEXT,
  PRIMARY KEY (connection_id, contributor_id)
);

CREATE TABLE hardcover_work_contributors (
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE RESTRICT,
  work_id INTEGER NOT NULL,
  contributor_id INTEGER NOT NULL,
  role_id INTEGER,
  role_name TEXT NOT NULL,
  contribution TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  position INTEGER NOT NULL DEFAULT 0,
  source_record_id TEXT NOT NULL REFERENCES source_records(id) ON DELETE RESTRICT,
  last_seen_run_id TEXT NOT NULL REFERENCES sync_runs(id) ON DELETE RESTRICT,
  upstream_state TEXT NOT NULL CHECK (upstream_state IN ('active', 'removed', 'unknown')),
  PRIMARY KEY (connection_id, work_id, contributor_id, role_name)
);
CREATE INDEX hardcover_work_contributors_lookup_idx ON hardcover_work_contributors(connection_id, contributor_id, upstream_state);

CREATE TABLE hardcover_edition_contributors (
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE RESTRICT,
  edition_id INTEGER NOT NULL,
  contributor_id INTEGER NOT NULL,
  role_id INTEGER,
  role_name TEXT NOT NULL,
  contribution TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  position INTEGER NOT NULL DEFAULT 0,
  source_record_id TEXT NOT NULL REFERENCES source_records(id) ON DELETE RESTRICT,
  last_seen_run_id TEXT NOT NULL REFERENCES sync_runs(id) ON DELETE RESTRICT,
  upstream_state TEXT NOT NULL CHECK (upstream_state IN ('active', 'removed', 'unknown')),
  PRIMARY KEY (connection_id, edition_id, contributor_id, role_name)
);
CREATE INDEX hardcover_edition_contributors_lookup_idx ON hardcover_edition_contributors(connection_id, contributor_id, upstream_state);

CREATE TABLE hardcover_series (
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE RESTRICT,
  series_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  slug TEXT,
  books_count INTEGER,
  source_record_id TEXT NOT NULL REFERENCES source_records(id) ON DELETE RESTRICT,
  last_seen_run_id TEXT NOT NULL REFERENCES sync_runs(id) ON DELETE RESTRICT,
  upstream_state TEXT NOT NULL CHECK (upstream_state IN ('active', 'removed', 'unknown')),
  first_observed_at TEXT NOT NULL,
  last_observed_at TEXT NOT NULL,
  retired_at TEXT,
  PRIMARY KEY (connection_id, series_id)
);

CREATE TABLE hardcover_work_series (
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE RESTRICT,
  work_id INTEGER NOT NULL,
  series_id INTEGER NOT NULL,
  position REAL,
  compilation INTEGER NOT NULL DEFAULT 0 CHECK (compilation IN (0, 1)),
  featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
  source_record_id TEXT NOT NULL REFERENCES source_records(id) ON DELETE RESTRICT,
  last_seen_run_id TEXT NOT NULL REFERENCES sync_runs(id) ON DELETE RESTRICT,
  upstream_state TEXT NOT NULL CHECK (upstream_state IN ('active', 'removed', 'unknown')),
  PRIMARY KEY (connection_id, work_id, series_id)
);
CREATE INDEX hardcover_work_series_series_idx ON hardcover_work_series(connection_id, series_id, upstream_state);

CREATE TABLE hardcover_work_taxonomy (
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE RESTRICT,
  work_id INTEGER NOT NULL,
  category TEXT NOT NULL,
  value TEXT NOT NULL,
  slug TEXT NOT NULL,
  source_record_id TEXT NOT NULL REFERENCES source_records(id) ON DELETE RESTRICT,
  last_seen_run_id TEXT NOT NULL REFERENCES sync_runs(id) ON DELETE RESTRICT,
  upstream_state TEXT NOT NULL CHECK (upstream_state IN ('active', 'removed', 'unknown')),
  PRIMARY KEY (connection_id, work_id, category, slug)
);
CREATE INDEX hardcover_work_taxonomy_filter_idx ON hardcover_work_taxonomy(connection_id, category, slug, upstream_state);

CREATE TABLE hardcover_user_book_reads (
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE RESTRICT,
  read_id INTEGER NOT NULL,
  user_book_id INTEGER NOT NULL,
  media_item_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE RESTRICT,
  archive_entry_id TEXT REFERENCES archive_entries(id) ON DELETE RESTRICT,
  edition_id INTEGER,
  started_at TEXT,
  paused_at TEXT,
  finished_at TEXT,
  finished_at_precision_raw TEXT,
  progress REAL,
  progress_pages INTEGER,
  progress_seconds INTEGER,
  source_record_id TEXT NOT NULL REFERENCES source_records(id) ON DELETE RESTRICT,
  last_seen_run_id TEXT NOT NULL REFERENCES sync_runs(id) ON DELETE RESTRICT,
  upstream_state TEXT NOT NULL CHECK (upstream_state IN ('active', 'removed', 'unknown')),
  first_observed_at TEXT NOT NULL,
  last_observed_at TEXT NOT NULL,
  retired_at TEXT,
  PRIMARY KEY (connection_id, read_id),
  CHECK (progress IS NULL OR progress >= 0),
  CHECK (progress_pages IS NULL OR progress_pages >= 0),
  CHECK (progress_seconds IS NULL OR progress_seconds >= 0)
);
CREATE INDEX hardcover_user_book_reads_media_idx ON hardcover_user_book_reads(media_item_id, upstream_state, finished_at);

CREATE TABLE book_library_projection (
  media_item_id TEXT PRIMARY KEY NOT NULL REFERENCES media_items(id) ON DELETE RESTRICT,
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE RESTRICT,
  user_book_id INTEGER NOT NULL,
  work_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  normalized_title TEXT NOT NULL,
  subtitle TEXT,
  primary_author_name TEXT,
  normalized_primary_author TEXT,
  cover_url TEXT,
  cover_color TEXT,
  publication_date TEXT,
  publication_precision TEXT CHECK (publication_precision IS NULL OR publication_precision IN ('year', 'month', 'day')),
  primary_series_name TEXT,
  current_status_id INTEGER NOT NULL,
  queue_added_at TEXT,
  in_queue INTEGER NOT NULL CHECK (in_queue IN (0, 1)),
  in_archive INTEGER NOT NULL CHECK (in_archive IN (0, 1)),
  currently_reading INTEGER NOT NULL CHECK (currently_reading IN (0, 1)),
  personal_rating REAL,
  latest_read_id INTEGER,
  latest_read_date TEXT,
  latest_read_precision TEXT CHECK (latest_read_precision IS NULL OR latest_read_precision IN ('year', 'month', 'day')),
  latest_read_format TEXT,
  current_edition_format TEXT,
  supported_read_count INTEGER NOT NULL DEFAULT 0,
  source_refreshed_at TEXT NOT NULL,
  projection_version INTEGER NOT NULL DEFAULT 1,
  CHECK (personal_rating IS NULL OR personal_rating BETWEEN 0 AND 5),
  CHECK (supported_read_count >= 0)
);
CREATE INDEX book_library_archive_recent_idx ON book_library_projection(in_archive, latest_read_date DESC, normalized_title, media_item_id);
CREATE INDEX book_library_queue_added_idx ON book_library_projection(in_queue, queue_added_at DESC, normalized_title, media_item_id);
CREATE INDEX book_library_title_idx ON book_library_projection(normalized_title, media_item_id);
CREATE INDEX book_library_author_idx ON book_library_projection(normalized_primary_author, normalized_title, media_item_id);
CREATE INDEX book_library_published_idx ON book_library_projection(publication_date, normalized_title, media_item_id);
CREATE INDEX book_library_rating_idx ON book_library_projection(personal_rating, normalized_title, media_item_id);

CREATE TABLE book_identifiers (
  media_item_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK (type IN ('isbn_10', 'isbn_13', 'asin')),
  normalized_value TEXT NOT NULL,
  display_value TEXT NOT NULL,
  PRIMARY KEY (media_item_id, type, normalized_value)
);
CREATE INDEX book_identifiers_value_idx ON book_identifiers(normalized_value, media_item_id);

CREATE VIRTUAL TABLE book_search USING fts5(
  media_item_id UNINDEXED,
  title,
  subtitle,
  contributors,
  series,
  identifiers,
  tokenize = 'unicode61 remove_diacritics 2'
);
