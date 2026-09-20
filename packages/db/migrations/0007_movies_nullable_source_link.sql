CREATE TABLE movie_library_projection_next (
  media_item_id TEXT PRIMARY KEY NOT NULL REFERENCES media_items(id) ON DELETE RESTRICT,
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE RESTRICT,
  film_uri TEXT,
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

INSERT INTO movie_library_projection_next SELECT * FROM movie_library_projection;
DROP TABLE movie_library_projection;
ALTER TABLE movie_library_projection_next RENAME TO movie_library_projection;

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
