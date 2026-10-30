-- Transcripts live in conversation-local SQLite; this index is rebuildable.
CREATE TABLE chat_conversation_index (
 id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL,
 favorite INTEGER NOT NULL CHECK(favorite IN (0,1)), activity_at TEXT NOT NULL,
 publication_revision INTEGER NOT NULL, deleted_at TEXT, body TEXT NOT NULL
);
CREATE INDEX chat_index_section_activity ON chat_conversation_index(favorite,deleted_at,activity_at DESC,id DESC);
CREATE TABLE chat_allowance_reservations (
 id TEXT PRIMARY KEY NOT NULL, period TEXT NOT NULL, run_id TEXT NOT NULL,
 reserved_microusd INTEGER NOT NULL CHECK(reserved_microusd>0),
 charged_microusd INTEGER CHECK(charged_microusd>=0), created_at TEXT NOT NULL
);
CREATE INDEX chat_allowance_period ON chat_allowance_reservations(period);

CREATE TABLE chat_run_leases (id TEXT PRIMARY KEY, expires_at TEXT NOT NULL);

CREATE INDEX chat_run_leases_expiry ON chat_run_leases(expires_at);
-- One monotonic revision avoids rescanning the whole archive for every cursor.
CREATE TABLE chat_library_revision (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL);
INSERT INTO chat_library_revision VALUES(1,0);
CREATE TRIGGER chat_revision_media_items_insert AFTER INSERT ON media_items
BEGIN UPDATE chat_library_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER chat_revision_media_items_update AFTER UPDATE ON media_items
BEGIN UPDATE chat_library_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER chat_revision_media_items_delete AFTER DELETE ON media_items
BEGIN UPDATE chat_library_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER chat_revision_archive_entries_insert AFTER INSERT ON archive_entries
BEGIN UPDATE chat_library_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER chat_revision_archive_entries_update AFTER UPDATE ON archive_entries
BEGIN UPDATE chat_library_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER chat_revision_archive_entries_delete AFTER DELETE ON archive_entries
BEGIN UPDATE chat_library_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER chat_revision_queue_entries_insert AFTER INSERT ON queue_entries
BEGIN UPDATE chat_library_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER chat_revision_queue_entries_update AFTER UPDATE ON queue_entries
BEGIN UPDATE chat_library_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER chat_revision_queue_entries_delete AFTER DELETE ON queue_entries
BEGIN UPDATE chat_library_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER chat_revision_book_library_projection_insert AFTER INSERT ON book_library_projection
BEGIN UPDATE chat_library_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER chat_revision_book_library_projection_update AFTER UPDATE ON book_library_projection
BEGIN UPDATE chat_library_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER chat_revision_book_library_projection_delete AFTER DELETE ON book_library_projection
BEGIN UPDATE chat_library_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER chat_revision_movie_library_projection_insert AFTER INSERT ON movie_library_projection
BEGIN UPDATE chat_library_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER chat_revision_movie_library_projection_update AFTER UPDATE ON movie_library_projection
BEGIN UPDATE chat_library_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER chat_revision_movie_library_projection_delete AFTER DELETE ON movie_library_projection
BEGIN UPDATE chat_library_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER chat_revision_article_library_projection_insert AFTER INSERT ON article_library_projection
BEGIN UPDATE chat_library_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER chat_revision_article_library_projection_update AFTER UPDATE ON article_library_projection
BEGIN UPDATE chat_library_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER chat_revision_article_library_projection_delete AFTER DELETE ON article_library_projection
BEGIN UPDATE chat_library_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER chat_revision_podcast_library_projection_insert AFTER INSERT ON podcast_library_projection
BEGIN UPDATE chat_library_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER chat_revision_podcast_library_projection_update AFTER UPDATE ON podcast_library_projection
BEGIN UPDATE chat_library_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER chat_revision_podcast_library_projection_delete AFTER DELETE ON podcast_library_projection
BEGIN UPDATE chat_library_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER chat_revision_video_library_projection_insert AFTER INSERT ON video_library_projection
BEGIN UPDATE chat_library_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER chat_revision_video_library_projection_update AFTER UPDATE ON video_library_projection
BEGIN UPDATE chat_library_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER chat_revision_video_library_projection_delete AFTER DELETE ON video_library_projection
BEGIN UPDATE chat_library_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER chat_revision_readwise_documents_insert AFTER INSERT ON readwise_documents
BEGIN UPDATE chat_library_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER chat_revision_readwise_documents_update AFTER UPDATE ON readwise_documents
BEGIN UPDATE chat_library_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER chat_revision_readwise_documents_delete AFTER DELETE ON readwise_documents
BEGIN UPDATE chat_library_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER chat_revision_readwise_highlights_insert AFTER INSERT ON readwise_highlights
BEGIN UPDATE chat_library_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER chat_revision_readwise_highlights_update AFTER UPDATE ON readwise_highlights
BEGIN UPDATE chat_library_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER chat_revision_readwise_highlights_delete AFTER DELETE ON readwise_highlights
BEGIN UPDATE chat_library_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER chat_revision_article_content_manifests_insert AFTER INSERT ON article_content_manifests
BEGIN UPDATE chat_library_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER chat_revision_article_content_manifests_update AFTER UPDATE ON article_content_manifests
BEGIN UPDATE chat_library_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER chat_revision_article_content_manifests_delete AFTER DELETE ON article_content_manifests
BEGIN UPDATE chat_library_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER chat_revision_article_content_chunks_insert AFTER INSERT ON article_content_chunks
BEGIN UPDATE chat_library_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER chat_revision_article_content_chunks_update AFTER UPDATE ON article_content_chunks
BEGIN UPDATE chat_library_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER chat_revision_article_content_chunks_delete AFTER DELETE ON article_content_chunks
BEGIN UPDATE chat_library_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER chat_revision_youtube_published_video_profiles_insert AFTER INSERT ON youtube_published_video_profiles
BEGIN UPDATE chat_library_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER chat_revision_youtube_published_video_profiles_update AFTER UPDATE ON youtube_published_video_profiles
BEGIN UPDATE chat_library_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER chat_revision_youtube_published_video_profiles_delete AFTER DELETE ON youtube_published_video_profiles
BEGIN UPDATE chat_library_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER chat_revision_youtube_published_channel_profiles_insert AFTER INSERT ON youtube_published_channel_profiles
BEGIN UPDATE chat_library_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER chat_revision_youtube_published_channel_profiles_update AFTER UPDATE ON youtube_published_channel_profiles
BEGIN UPDATE chat_library_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER chat_revision_youtube_published_channel_profiles_delete AFTER DELETE ON youtube_published_channel_profiles
BEGIN UPDATE chat_library_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER chat_revision_youtube_published_categories_insert AFTER INSERT ON youtube_published_categories
BEGIN UPDATE chat_library_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER chat_revision_youtube_published_categories_update AFTER UPDATE ON youtube_published_categories
BEGIN UPDATE chat_library_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER chat_revision_youtube_published_categories_delete AFTER DELETE ON youtube_published_categories
BEGIN UPDATE chat_library_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER chat_revision_youtube_search_expiry_insert AFTER INSERT ON youtube_search_expiry
BEGIN UPDATE chat_library_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER chat_revision_youtube_search_expiry_update AFTER UPDATE ON youtube_search_expiry
BEGIN UPDATE chat_library_revision SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER chat_revision_youtube_search_expiry_delete AFTER DELETE ON youtube_search_expiry
BEGIN UPDATE chat_library_revision SET revision=revision+1 WHERE id=1; END;
