CREATE TABLE spotify_podcast_episodes (
  media_item_id TEXT PRIMARY KEY NOT NULL REFERENCES media_items(id) ON DELETE RESTRICT,
  spotify_episode_uri TEXT NOT NULL UNIQUE,
  spotify_episode_id TEXT NOT NULL,
  show_id TEXT,
  show_uri TEXT,
  current_title TEXT,
  historical_title TEXT,
  show_name TEXT,
  description TEXT,
  image_url TEXT,
  canonical_url TEXT,
  published_at_value TEXT,
  published_at_precision TEXT,
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  availability_state TEXT NOT NULL DEFAULT 'unknown' CHECK (availability_state IN ('unknown','available','unavailable','stale','error')),
  metadata_observed_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE spotify_podcast_playback_observations (
  id TEXT PRIMARY KEY NOT NULL,
  source_record_id TEXT NOT NULL UNIQUE REFERENCES source_records(id) ON DELETE RESTRICT,
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE RESTRICT,
  media_item_id TEXT REFERENCES media_items(id) ON DELETE RESTRICT,
  spotify_episode_uri TEXT,
  occurred_at TEXT,
  milliseconds_played INTEGER NOT NULL CHECK (milliseconds_played >= 0),
  positive INTEGER NOT NULL CHECK (positive IN (0,1)),
  episode_title TEXT,
  show_name TEXT,
  reason_start TEXT,
  reason_end TEXT,
  skipped INTEGER CHECK (skipped IS NULL OR skipped IN (0,1)),
  parser_version TEXT NOT NULL
);
CREATE INDEX spotify_podcast_playback_media_time_idx ON spotify_podcast_playback_observations(media_item_id, occurred_at DESC);
CREATE INDEX spotify_podcast_playback_connection_uri_idx ON spotify_podcast_playback_observations(connection_id, spotify_episode_uri, positive);

CREATE TABLE spotify_saved_episodes (
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE RESTRICT,
  spotify_episode_uri TEXT NOT NULL,
  media_item_id TEXT REFERENCES media_items(id) ON DELETE RESTRICT,
  source_record_id TEXT NOT NULL REFERENCES source_records(id) ON DELETE RESTRICT,
  added_at TEXT,
  resume_position_ms INTEGER CHECK (resume_position_ms IS NULL OR resume_position_ms >= 0),
  fully_played INTEGER CHECK (fully_played IS NULL OR fully_played IN (0,1)),
  active INTEGER NOT NULL CHECK (active IN (0,1)),
  first_observed_at TEXT NOT NULL,
  last_observed_at TEXT NOT NULL,
  retired_observed_at TEXT,
  PRIMARY KEY(connection_id, spotify_episode_uri)
);
CREATE INDEX spotify_saved_episodes_active_idx ON spotify_saved_episodes(connection_id, active, added_at DESC);

CREATE TABLE spotify_podcast_shows (
  id TEXT PRIMARY KEY NOT NULL,
  spotify_show_uri TEXT NOT NULL UNIQUE,
  spotify_show_id TEXT NOT NULL,
  name TEXT,
  publisher TEXT,
  description TEXT,
  image_url TEXT,
  canonical_url TEXT,
  languages_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(languages_json)),
  total_episodes INTEGER CHECK (total_episodes IS NULL OR total_episodes >= 0),
  availability_state TEXT NOT NULL DEFAULT 'unknown' CHECK (availability_state IN ('unknown','available','unavailable','stale','error')),
  metadata_observed_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE spotify_saved_shows (
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE RESTRICT,
  show_id TEXT NOT NULL REFERENCES spotify_podcast_shows(id) ON DELETE RESTRICT,
  source_record_id TEXT NOT NULL REFERENCES source_records(id) ON DELETE RESTRICT,
  added_at TEXT,
  active INTEGER NOT NULL CHECK (active IN (0,1)),
  first_observed_at TEXT NOT NULL,
  last_observed_at TEXT NOT NULL,
  retired_observed_at TEXT,
  PRIMARY KEY(connection_id, show_id)
);
CREATE INDEX spotify_saved_shows_active_idx ON spotify_saved_shows(connection_id, active, added_at DESC);

CREATE TABLE spotify_player_observations (
  id TEXT PRIMARY KEY NOT NULL,
  source_record_id TEXT REFERENCES source_records(id) ON DELETE RESTRICT,
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE RESTRICT,
  media_item_id TEXT REFERENCES media_items(id) ON DELETE RESTRICT,
  item_type TEXT CHECK (item_type IS NULL OR item_type IN ('episode','track','unknown')),
  item_uri TEXT,
  progress_ms INTEGER CHECK (progress_ms IS NULL OR progress_ms >= 0),
  is_playing INTEGER CHECK (is_playing IS NULL OR is_playing IN (0,1)),
  source_timestamp TEXT,
  observed_at TEXT NOT NULL,
  empty INTEGER NOT NULL CHECK (empty IN (0,1))
);
CREATE INDEX spotify_player_connection_observed_idx ON spotify_player_observations(connection_id, observed_at DESC);

CREATE TABLE podcast_library_projection (
  media_item_id TEXT PRIMARY KEY NOT NULL REFERENCES media_items(id) ON DELETE RESTRICT,
  spotify_episode_uri TEXT,
  title TEXT,
  show_id TEXT,
  show_name TEXT,
  image_url TEXT,
  published_at_value TEXT,
  published_at_precision TEXT,
  duration_ms INTEGER,
  in_archive INTEGER NOT NULL CHECK (in_archive IN (0,1)),
  in_queue INTEGER NOT NULL CHECK (in_queue IN (0,1)),
  saved_episode INTEGER NOT NULL CHECK (saved_episode IN (0,1)),
  following_show INTEGER NOT NULL CHECK (following_show IN (0,1)),
  latest_activity_at TEXT,
  saved_at TEXT,
  observed_ms INTEGER NOT NULL DEFAULT 0,
  playback_observation_count INTEGER NOT NULL DEFAULT 0,
  availability_state TEXT NOT NULL DEFAULT 'unknown',
  source_refreshed_at TEXT NOT NULL,
  projection_version INTEGER NOT NULL
);
CREATE INDEX podcast_library_archive_idx ON podcast_library_projection(in_archive, latest_activity_at DESC, media_item_id);
CREATE INDEX podcast_library_queue_idx ON podcast_library_projection(in_queue, saved_at DESC, media_item_id);
CREATE INDEX podcast_library_show_idx ON podcast_library_projection(show_id, in_archive, in_queue);

CREATE VIRTUAL TABLE podcast_search USING fts5(media_item_id UNINDEXED, title, show_name, publisher);
