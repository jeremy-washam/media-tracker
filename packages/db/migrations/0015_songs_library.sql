CREATE TABLE spotify_song_observations (
  id TEXT PRIMARY KEY NOT NULL,
  source_record_id TEXT NOT NULL UNIQUE REFERENCES source_records(id) ON DELETE RESTRICT,
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE RESTRICT,
  media_item_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE RESTRICT,
  spotify_track_uri TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('export','recent_api')),
  occurred_at TEXT,
  milliseconds_played INTEGER CHECK (milliseconds_played IS NULL OR milliseconds_played >= 0),
  skipped INTEGER CHECK (skipped IS NULL OR skipped IN (0,1)),
  track_name TEXT,
  artist_name TEXT,
  album_name TEXT,
  reason_start TEXT,
  reason_end TEXT,
  parser_version TEXT NOT NULL
);
CREATE INDEX spotify_song_observations_track_time_idx ON spotify_song_observations(media_item_id, occurred_at DESC);
CREATE INDEX spotify_song_observations_connection_time_idx ON spotify_song_observations(connection_id, occurred_at DESC);
CREATE UNIQUE INDEX spotify_song_recent_event_unique
  ON spotify_song_observations(connection_id,spotify_track_uri,occurred_at)
  WHERE source_kind='recent_api';

CREATE TABLE spotify_song_tracks (
  media_item_id TEXT PRIMARY KEY NOT NULL REFERENCES media_items(id) ON DELETE RESTRICT,
  spotify_track_uri TEXT NOT NULL UNIQUE,
  spotify_track_id TEXT NOT NULL,
  title TEXT,
  artist_text TEXT,
  album_id TEXT,
  album_uri TEXT,
  album_name TEXT,
  image_url TEXT,
  canonical_url TEXT,
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  explicit INTEGER CHECK (explicit IS NULL OR explicit IN (0,1)),
  isrc TEXT,
  latest_played_at TEXT,
  first_played_at TEXT,
  playback_count INTEGER NOT NULL DEFAULT 0,
  observed_ms INTEGER NOT NULL DEFAULT 0,
  api_only_count INTEGER NOT NULL DEFAULT 0,
  metadata_state TEXT NOT NULL DEFAULT 'export_only' CHECK (metadata_state IN ('current','export_only','unavailable','expired','error')),
  metadata_observed_at TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX spotify_song_tracks_latest_idx ON spotify_song_tracks(latest_played_at DESC, media_item_id);
CREATE INDEX spotify_song_tracks_count_idx ON spotify_song_tracks(playback_count DESC, media_item_id);

CREATE TABLE spotify_song_albums (
  id TEXT PRIMARY KEY NOT NULL,
  spotify_album_uri TEXT NOT NULL UNIQUE,
  spotify_album_id TEXT NOT NULL,
  name TEXT,
  artist_text TEXT,
  album_type TEXT,
  release_date_value TEXT,
  release_date_precision TEXT,
  image_url TEXT,
  canonical_url TEXT,
  metadata_observed_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE spotify_song_artists (
  id TEXT PRIMARY KEY NOT NULL,
  spotify_artist_uri TEXT NOT NULL UNIQUE,
  spotify_artist_id TEXT NOT NULL,
  name TEXT,
  canonical_url TEXT,
  metadata_observed_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE spotify_song_track_artists (
  media_item_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE RESTRICT,
  artist_id TEXT NOT NULL REFERENCES spotify_song_artists(id) ON DELETE RESTRICT,
  credit_order INTEGER NOT NULL CHECK (credit_order >= 0),
  PRIMARY KEY(media_item_id, artist_id)
);
CREATE INDEX spotify_song_track_artists_artist_idx ON spotify_song_track_artists(artist_id, media_item_id);

CREATE VIRTUAL TABLE music_search USING fts5(media_item_id UNINDEXED, title, artist, album, isrc);
