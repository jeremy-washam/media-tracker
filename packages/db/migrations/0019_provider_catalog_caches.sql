CREATE TABLE catalog_refresh_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('tmdb','youtube')),
  state TEXT NOT NULL CHECK (state IN ('pending','running','succeeded','failed')),
  cursor_value TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  requested_count INTEGER NOT NULL DEFAULT 0 CHECK (requested_count >= 0),
  returned_count INTEGER NOT NULL DEFAULT 0 CHECK (returned_count >= 0),
  omitted_count INTEGER NOT NULL DEFAULT 0 CHECK (omitted_count >= 0),
  quota_unit_estimate INTEGER NOT NULL DEFAULT 0 CHECK (quota_unit_estimate >= 0),
  lease_expires_at TEXT,
  next_attempt_at TEXT,
  safe_error_code TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX catalog_refresh_jobs_provider_state_idx
  ON catalog_refresh_jobs(provider, state, created_at DESC);
CREATE UNIQUE INDEX catalog_refresh_jobs_one_active_provider_idx
  ON catalog_refresh_jobs(provider) WHERE state IN ('pending','running');

CREATE TABLE tmdb_configuration (
  singleton_id INTEGER PRIMARY KEY NOT NULL CHECK (singleton_id = 1),
  secure_base_url TEXT NOT NULL,
  poster_base_url TEXT NOT NULL,
  backdrop_base_url TEXT NOT NULL,
  poster_sizes_json TEXT NOT NULL CHECK (json_valid(poster_sizes_json)),
  backdrop_sizes_json TEXT NOT NULL CHECK (json_valid(backdrop_sizes_json)),
  fetched_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  etag TEXT
);

CREATE TABLE tmdb_movie_matches (
  media_item_id TEXT PRIMARY KEY NOT NULL REFERENCES media_items(id) ON DELETE RESTRICT,
  tmdb_movie_id INTEGER,
  match_status TEXT NOT NULL CHECK (match_status IN ('pending','matched','unmatched','ambiguous','error')),
  match_method TEXT CHECK (match_method IN ('exact_tmdb_id','exact_imdb_id','exact_title_year')),
  candidate_count INTEGER NOT NULL DEFAULT 0 CHECK (candidate_count >= 0),
  matcher_version TEXT NOT NULL,
  last_attempted_at TEXT NOT NULL,
  matched_at TEXT,
  safe_error_code TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE (tmdb_movie_id)
);
CREATE INDEX tmdb_movie_matches_status_idx
  ON tmdb_movie_matches(match_status, media_item_id);

CREATE TABLE tmdb_movie_profiles (
  tmdb_movie_id INTEGER PRIMARY KEY NOT NULL,
  current_title TEXT NOT NULL,
  original_title TEXT NOT NULL,
  original_language TEXT,
  overview TEXT,
  release_date TEXT,
  runtime_minutes INTEGER CHECK (runtime_minutes IS NULL OR runtime_minutes >= 0),
  poster_path TEXT,
  backdrop_path TEXT,
  tagline TEXT,
  imdb_id TEXT,
  status TEXT,
  vote_average REAL,
  vote_count INTEGER CHECK (vote_count IS NULL OR vote_count >= 0),
  fetched_at TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  etag TEXT
);
CREATE INDEX tmdb_movie_profiles_expiry_idx ON tmdb_movie_profiles(expires_at);

CREATE TABLE tmdb_movie_genres (
  tmdb_movie_id INTEGER NOT NULL REFERENCES tmdb_movie_profiles(tmdb_movie_id) ON DELETE CASCADE,
  genre_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  PRIMARY KEY (tmdb_movie_id, genre_id)
);
CREATE TABLE tmdb_movie_credits (
  tmdb_movie_id INTEGER NOT NULL REFERENCES tmdb_movie_profiles(tmdb_movie_id) ON DELETE CASCADE,
  credit_id TEXT NOT NULL,
  person_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  credit_kind TEXT NOT NULL CHECK (credit_kind IN ('director','cast')),
  character_name TEXT,
  position INTEGER NOT NULL CHECK (position >= 0),
  PRIMARY KEY (tmdb_movie_id, credit_id)
);
CREATE INDEX tmdb_movie_credits_kind_idx
  ON tmdb_movie_credits(tmdb_movie_id, credit_kind, position);
CREATE TABLE tmdb_movie_countries (
  tmdb_movie_id INTEGER NOT NULL REFERENCES tmdb_movie_profiles(tmdb_movie_id) ON DELETE CASCADE,
  country_code TEXT NOT NULL,
  name TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  PRIMARY KEY (tmdb_movie_id, country_code)
);
CREATE TABLE tmdb_movie_alternative_titles (
  tmdb_movie_id INTEGER NOT NULL REFERENCES tmdb_movie_profiles(tmdb_movie_id) ON DELETE CASCADE,
  country_code TEXT NOT NULL,
  title TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  PRIMARY KEY (tmdb_movie_id, country_code, title)
);

CREATE TABLE youtube_video_catalog_profiles (
  media_item_id TEXT PRIMARY KEY NOT NULL REFERENCES media_items(id) ON DELETE RESTRICT,
  video_id TEXT NOT NULL UNIQUE,
  lookup_state TEXT NOT NULL CHECK (lookup_state IN ('current','unavailable','error')),
  current_title TEXT,
  description TEXT,
  channel_id TEXT,
  channel_title TEXT,
  published_at TEXT,
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  category_id TEXT,
  tags_json TEXT CHECK (tags_json IS NULL OR json_valid(tags_json)),
  caption_available INTEGER CHECK (caption_available IS NULL OR caption_available IN (0,1)),
  definition TEXT,
  projection TEXT,
  privacy_status TEXT,
  upload_status TEXT,
  embeddable INTEGER CHECK (embeddable IS NULL OR embeddable IN (0,1)),
  made_for_kids INTEGER CHECK (made_for_kids IS NULL OR made_for_kids IN (0,1)),
  region_restriction_json TEXT CHECK (region_restriction_json IS NULL OR json_valid(region_restriction_json)),
  live_broadcast_content TEXT,
  scheduled_start_at TEXT,
  actual_start_at TEXT,
  actual_end_at TEXT,
  fetched_at TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  etag TEXT,
  safe_error_code TEXT
);
CREATE INDEX youtube_video_catalog_expiry_idx
  ON youtube_video_catalog_profiles(expires_at, video_id);
CREATE INDEX youtube_video_catalog_channel_idx
  ON youtube_video_catalog_profiles(channel_id, video_id);

CREATE TABLE youtube_video_thumbnails (
  video_id TEXT NOT NULL,
  variant TEXT NOT NULL,
  url TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  fetched_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (video_id, variant)
);
CREATE INDEX youtube_video_thumbnails_expiry_idx ON youtube_video_thumbnails(expires_at);

CREATE TABLE youtube_channel_catalog_profiles (
  channel_id TEXT PRIMARY KEY NOT NULL,
  current_title TEXT NOT NULL,
  description TEXT,
  custom_url TEXT,
  published_at TEXT,
  country TEXT,
  thumbnail_url TEXT,
  fetched_at TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  etag TEXT
);
CREATE INDEX youtube_channel_catalog_expiry_idx
  ON youtube_channel_catalog_profiles(expires_at, channel_id);

CREATE TABLE youtube_categories (
  category_id TEXT NOT NULL,
  region_code TEXT NOT NULL,
  title TEXT NOT NULL,
  assignable INTEGER NOT NULL CHECK (assignable IN (0,1)),
  fetched_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (category_id, region_code)
);
CREATE INDEX youtube_categories_expiry_idx ON youtube_categories(expires_at, region_code);

CREATE TABLE youtube_catalog_request_outcomes (
  job_id TEXT NOT NULL REFERENCES catalog_refresh_jobs(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('returned','omitted')),
  checked_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (job_id, video_id)
);
CREATE INDEX youtube_catalog_outcomes_expiry_idx
  ON youtube_catalog_request_outcomes(expires_at, video_id);

ALTER TABLE movie_library_projection ADD COLUMN tmdb_movie_id INTEGER;
ALTER TABLE movie_library_projection ADD COLUMN enrichment_status TEXT NOT NULL DEFAULT 'not_configured';
ALTER TABLE movie_library_projection ADD COLUMN enrichment_refreshed_at TEXT;
ALTER TABLE movie_library_projection ADD COLUMN catalog_expires_at TEXT;
ALTER TABLE video_library_projection ADD COLUMN category_id TEXT;
ALTER TABLE video_library_projection ADD COLUMN category_title TEXT;
ALTER TABLE video_library_projection ADD COLUMN caption_available INTEGER;
ALTER TABLE video_library_projection ADD COLUMN definition TEXT;
ALTER TABLE video_library_projection ADD COLUMN projection_kind TEXT;
ALTER TABLE video_library_projection ADD COLUMN live_state TEXT;
ALTER TABLE video_library_projection ADD COLUMN catalog_checked_at TEXT;
ALTER TABLE video_library_projection ADD COLUMN catalog_expires_at TEXT;
