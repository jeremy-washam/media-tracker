ALTER TABLE article_library_projection
  ADD COLUMN current_available INTEGER NOT NULL DEFAULT 1
  CHECK (current_available IN (0, 1));

CREATE INDEX article_library_current_state_idx
  ON article_library_projection(in_archive, current_available, current_location, normalized_title, media_item_id);
