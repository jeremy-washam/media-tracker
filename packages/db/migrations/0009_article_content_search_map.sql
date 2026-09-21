CREATE TABLE article_content_search_map (
  rowid INTEGER PRIMARY KEY AUTOINCREMENT,
  manifest_id TEXT NOT NULL REFERENCES article_content_manifests(id) ON DELETE RESTRICT,
  chunk_ordinal INTEGER NOT NULL,
  UNIQUE (manifest_id, chunk_ordinal),
  FOREIGN KEY (manifest_id, chunk_ordinal)
    REFERENCES article_content_chunks(manifest_id, ordinal) ON DELETE RESTRICT
);
CREATE INDEX article_content_search_map_manifest_idx
  ON article_content_search_map(manifest_id, chunk_ordinal);
