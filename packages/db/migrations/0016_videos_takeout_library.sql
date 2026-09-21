CREATE TABLE youtube_takeout_components (
  raw_object_id TEXT NOT NULL REFERENCES raw_objects(id) ON DELETE RESTRICT,
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE RESTRICT,
  component_kind TEXT NOT NULL CHECK (component_kind IN ('watch_history','watch_later','playlist_index','subscriptions')),
  member_name TEXT,
  parser_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('missing','invalid','processing','complete','failed')),
  expected_record_count INTEGER NOT NULL CHECK (expected_record_count >= 0),
  processed_record_count INTEGER NOT NULL CHECK (processed_record_count >= 0),
  sync_run_id TEXT REFERENCES sync_runs(id) ON DELETE RESTRICT,
  completed_at TEXT,
  finalized_at TEXT,
  error_code TEXT,
  PRIMARY KEY (raw_object_id, component_kind)
);
CREATE INDEX youtube_takeout_components_connection_idx
  ON youtube_takeout_components(connection_id, component_kind, completed_at DESC);

CREATE TABLE youtube_channels (
  channel_id TEXT PRIMARY KEY NOT NULL,
  latest_title TEXT,
  latest_url TEXT,
  first_observed_at TEXT NOT NULL,
  last_observed_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE youtube_channel_assertions (
  source_record_id TEXT PRIMARY KEY NOT NULL REFERENCES source_records(id) ON DELETE RESTRICT,
  channel_id TEXT NOT NULL REFERENCES youtube_channels(channel_id) ON DELETE RESTRICT,
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE RESTRICT,
  assertion_kind TEXT NOT NULL CHECK (assertion_kind IN ('watch','subscription')),
  title TEXT,
  url TEXT,
  observed_at TEXT NOT NULL
);
CREATE INDEX youtube_channel_assertions_channel_idx
  ON youtube_channel_assertions(channel_id, observed_at DESC, source_record_id);

CREATE TABLE youtube_watch_observations (
  source_record_id TEXT PRIMARY KEY NOT NULL REFERENCES source_records(id) ON DELETE RESTRICT,
  archive_entry_id TEXT NOT NULL REFERENCES archive_entries(id) ON DELETE RESTRICT,
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE RESTRICT,
  media_item_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE RESTRICT,
  video_id TEXT NOT NULL,
  historical_title TEXT,
  source_video_url TEXT,
  historical_channel_title TEXT,
  source_channel_url TEXT,
  channel_id TEXT REFERENCES youtube_channels(channel_id) ON DELETE RESTRICT,
  product TEXT NOT NULL CHECK (product IN ('youtube','youtube_music','unknown')),
  from_google_ads INTEGER NOT NULL CHECK (from_google_ads IN (0,1)),
  occurred_at TEXT NOT NULL,
  occurred_at_raw TEXT,
  occurrence_rank INTEGER NOT NULL CHECK (occurrence_rank >= 0),
  parser_version TEXT NOT NULL,
  observed_at TEXT NOT NULL
);
CREATE INDEX youtube_watch_media_time_idx
  ON youtube_watch_observations(media_item_id, occurred_at DESC, archive_entry_id);
CREATE INDEX youtube_watch_connection_time_idx
  ON youtube_watch_observations(connection_id, occurred_at DESC, media_item_id);
CREATE INDEX youtube_watch_channel_idx
  ON youtube_watch_observations(channel_id, occurred_at DESC, media_item_id);
CREATE INDEX youtube_watch_product_idx
  ON youtube_watch_observations(product, occurred_at DESC, media_item_id);

CREATE TABLE youtube_channel_subscriptions (
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE RESTRICT,
  channel_id TEXT NOT NULL REFERENCES youtube_channels(channel_id) ON DELETE RESTRICT,
  source_record_id TEXT NOT NULL REFERENCES source_records(id) ON DELETE RESTRICT,
  provider_subscription_id TEXT,
  channel_title TEXT,
  channel_url TEXT,
  subscribed_at TEXT,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('takeout','oauth')),
  upstream_state TEXT NOT NULL CHECK (upstream_state IN ('active','removed','unknown')),
  first_observed_at TEXT NOT NULL,
  last_observed_at TEXT NOT NULL,
  retired_observed_at TEXT,
  parser_version TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (connection_id, channel_id)
);
CREATE INDEX youtube_subscriptions_channel_state_idx
  ON youtube_channel_subscriptions(channel_id, upstream_state, connection_id);
CREATE INDEX youtube_subscriptions_connection_state_idx
  ON youtube_channel_subscriptions(connection_id, upstream_state, channel_id);

CREATE TABLE video_library_projection (
  media_item_id TEXT PRIMARY KEY NOT NULL REFERENCES media_items(id) ON DELETE RESTRICT,
  video_id TEXT NOT NULL UNIQUE,
  display_title TEXT NOT NULL,
  normalized_title TEXT NOT NULL,
  channel_id TEXT REFERENCES youtube_channels(channel_id) ON DELETE RESTRICT,
  display_channel_title TEXT,
  normalized_channel_title TEXT,
  canonical_url TEXT NOT NULL,
  image_url TEXT,
  published_at TEXT,
  duration_ms INTEGER,
  availability_state TEXT NOT NULL CHECK (availability_state IN ('not_configured','pending','available','unavailable','stale','error')),
  metadata_state TEXT NOT NULL CHECK (metadata_state IN ('not_configured','missing','current','stale','error')),
  source_format TEXT NOT NULL CHECK (source_format IN ('youtube','youtube_music','mixed','unknown')),
  archive_active INTEGER NOT NULL CHECK (archive_active IN (0,1)),
  watch_occurrence_count INTEGER NOT NULL CHECK (watch_occurrence_count >= 0),
  watch_account_count INTEGER NOT NULL CHECK (watch_account_count >= 0),
  latest_watched_at TEXT,
  queue_active INTEGER NOT NULL CHECK (queue_active IN (0,1)),
  queue_relationship_count INTEGER NOT NULL CHECK (queue_relationship_count >= 0),
  queue_account_count INTEGER NOT NULL CHECK (queue_account_count >= 0),
  latest_queue_added_at TEXT,
  projection_generation INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX video_library_archive_recent_idx
  ON video_library_projection(archive_active, latest_watched_at DESC, media_item_id);
CREATE INDEX video_library_archive_title_idx
  ON video_library_projection(archive_active, normalized_title, media_item_id);
CREATE INDEX video_library_archive_channel_idx
  ON video_library_projection(archive_active, normalized_channel_title, media_item_id);
CREATE INDEX video_library_archive_count_idx
  ON video_library_projection(archive_active, watch_occurrence_count DESC, media_item_id);
CREATE INDEX video_library_queue_recent_idx
  ON video_library_projection(queue_active, latest_queue_added_at DESC, media_item_id);
CREATE INDEX video_library_queue_title_idx
  ON video_library_projection(queue_active, normalized_title, media_item_id);
CREATE INDEX video_library_queue_channel_idx
  ON video_library_projection(queue_active, normalized_channel_title, media_item_id);
CREATE INDEX video_library_channel_id_idx
  ON video_library_projection(channel_id, archive_active, queue_active, media_item_id);

CREATE TABLE video_channel_projection (
  channel_id TEXT PRIMARY KEY NOT NULL REFERENCES youtube_channels(channel_id) ON DELETE RESTRICT,
  display_title TEXT NOT NULL,
  normalized_title TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  image_url TEXT,
  library_active INTEGER NOT NULL CHECK (library_active IN (0,1)),
  following_active INTEGER NOT NULL CHECK (following_active IN (0,1)),
  subscription_count INTEGER NOT NULL CHECK (subscription_count >= 0),
  archive_video_count INTEGER NOT NULL CHECK (archive_video_count >= 0),
  watch_occurrence_count INTEGER NOT NULL CHECK (watch_occurrence_count >= 0),
  latest_watched_at TEXT,
  queue_video_count INTEGER NOT NULL CHECK (queue_video_count >= 0),
  projection_generation INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX video_channel_views_idx
  ON video_channel_projection(library_active, watch_occurrence_count DESC, channel_id);
CREATE INDEX video_channel_recent_idx
  ON video_channel_projection(library_active, latest_watched_at DESC, channel_id);
CREATE INDEX video_channel_queue_idx
  ON video_channel_projection(library_active, queue_video_count DESC, channel_id);
CREATE INDEX video_channel_title_idx
  ON video_channel_projection(library_active, normalized_title, channel_id);
CREATE INDEX video_channel_following_idx
  ON video_channel_projection(library_active, following_active, watch_occurrence_count DESC, channel_id);

CREATE VIRTUAL TABLE video_search USING fts5(
  media_item_id UNINDEXED,
  titles,
  channel_titles,
  tokenize = 'unicode61 remove_diacritics 2'
);
CREATE VIRTUAL TABLE video_channel_search USING fts5(
  channel_id UNINDEXED,
  titles,
  tokenize = 'unicode61 remove_diacritics 2'
);
