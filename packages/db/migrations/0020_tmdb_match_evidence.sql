CREATE TABLE tmdb_movie_matches_v2 (
  media_item_id TEXT PRIMARY KEY NOT NULL REFERENCES media_items(id) ON DELETE RESTRICT,
  tmdb_movie_id INTEGER,
  tmdb_tv_id INTEGER,
  match_status TEXT NOT NULL CHECK (match_status IN ('pending','matched','unmatched','ambiguous','error')),
  match_method TEXT CHECK (match_method IN (
    'exact_tmdb_id','exact_imdb_id','exact_title_year',
    'verified_release_year','dominant_title_year_votes','exact_tv_title_year'
  )),
  candidate_count INTEGER NOT NULL DEFAULT 0 CHECK (candidate_count >= 0),
  matcher_version TEXT NOT NULL,
  last_attempted_at TEXT NOT NULL,
  matched_at TEXT,
  safe_error_code TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE (tmdb_movie_id),
  UNIQUE (tmdb_tv_id)
);

INSERT INTO tmdb_movie_matches_v2(
  media_item_id,tmdb_movie_id,match_status,match_method,candidate_count,
  matcher_version,last_attempted_at,matched_at,safe_error_code,updated_at
)
SELECT media_item_id,tmdb_movie_id,match_status,match_method,candidate_count,
  matcher_version,last_attempted_at,matched_at,safe_error_code,updated_at
FROM tmdb_movie_matches;

DROP TABLE tmdb_movie_matches;
ALTER TABLE tmdb_movie_matches_v2 RENAME TO tmdb_movie_matches;
CREATE INDEX tmdb_movie_matches_status_idx
  ON tmdb_movie_matches(match_status, media_item_id);

CREATE TABLE tmdb_tv_profiles (
  tmdb_tv_id INTEGER PRIMARY KEY NOT NULL,
  current_title TEXT NOT NULL,
  original_title TEXT NOT NULL,
  original_language TEXT,
  overview TEXT,
  first_air_date TEXT,
  poster_path TEXT,
  backdrop_path TEXT,
  tagline TEXT,
  status TEXT,
  vote_average REAL,
  vote_count INTEGER,
  creator_names_json TEXT NOT NULL CHECK (json_valid(creator_names_json)),
  genres_json TEXT NOT NULL CHECK (json_valid(genres_json)),
  cast_json TEXT NOT NULL CHECK (json_valid(cast_json)),
  countries_json TEXT NOT NULL CHECK (json_valid(countries_json)),
  fetched_at TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  etag TEXT
);

ALTER TABLE movie_library_projection ADD COLUMN tmdb_tv_id INTEGER;
