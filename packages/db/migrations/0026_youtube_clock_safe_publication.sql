CREATE TABLE youtube_publication_state(singleton_id INTEGER PRIMARY KEY CHECK(singleton_id=1),revision INTEGER NOT NULL DEFAULT 0,last_published_job_id TEXT,association_revision INTEGER NOT NULL DEFAULT 0,channel_aggregate_revision INTEGER NOT NULL DEFAULT 0);
INSERT INTO youtube_publication_state(singleton_id,revision) VALUES(1,0);

-- Browse projections are retained-source facts. Provider overlays are independently
-- expiring published snapshots; refresh staging cannot overwrite a valid publication.
UPDATE youtube_channels SET latest_title=(
 SELECT a.title FROM youtube_channel_assertions a JOIN source_records s ON s.id=a.source_record_id
 JOIN raw_objects r ON r.id=s.raw_object_id WHERE a.channel_id=youtube_channels.channel_id AND a.title IS NOT NULL
 ORDER BY r.acquired_at DESC,a.source_record_id DESC LIMIT 1);
UPDATE video_library_projection SET
 display_title=COALESCE((SELECT w.historical_title FROM youtube_watch_observations w
 JOIN source_records s ON s.id=w.source_record_id JOIN raw_objects r ON r.id=s.raw_object_id
 WHERE w.media_item_id=video_library_projection.media_item_id AND w.historical_title IS NOT NULL
 ORDER BY r.acquired_at DESC,w.source_record_id DESC LIMIT 1),
 (SELECT title FROM media_items m WHERE m.id=video_library_projection.media_item_id),'Untitled video'),
 channel_id=(SELECT w.channel_id FROM youtube_watch_observations w
 JOIN source_records s ON s.id=w.source_record_id JOIN raw_objects r ON r.id=s.raw_object_id
 WHERE w.media_item_id=video_library_projection.media_item_id AND w.channel_id IS NOT NULL
 ORDER BY r.acquired_at DESC,w.source_record_id DESC LIMIT 1),
 image_url=NULL,published_at=NULL,duration_ms=NULL,category_id=NULL,category_title=NULL,
 caption_available=NULL,definition=NULL,projection_kind=NULL,live_state=NULL,
 catalog_checked_at=NULL,catalog_expires_at=NULL,availability_state='not_configured',metadata_state='not_configured';
UPDATE video_library_projection SET normalized_title=LOWER(display_title),
 display_channel_title=(SELECT latest_title FROM youtube_channels c WHERE c.channel_id=video_library_projection.channel_id);
UPDATE video_library_projection SET normalized_channel_title=LOWER(display_channel_title);
UPDATE video_channel_projection SET display_title=COALESCE(
 (SELECT latest_title FROM youtube_channels c WHERE c.channel_id=video_channel_projection.channel_id),'Channel unavailable'),
 canonical_url='https://www.youtube.com/channel/'||channel_id,image_url=NULL;
UPDATE video_channel_projection SET normalized_title=LOWER(display_title);

DELETE FROM video_channel_projection;
INSERT INTO video_channel_projection(channel_id,display_title,normalized_title,canonical_url,image_url,library_active,following_active,subscription_count,archive_video_count,watch_occurrence_count,latest_watched_at,queue_video_count,projection_generation,updated_at)
 SELECT c.channel_id,COALESCE(c.latest_title,'Channel unavailable'),LOWER(COALESCE(c.latest_title,'Channel unavailable')),
 'https://www.youtube.com/channel/'||c.channel_id,NULL,1,
 EXISTS(SELECT 1 FROM youtube_channel_subscriptions s WHERE s.channel_id=c.channel_id AND s.upstream_state='active'),
 (SELECT COUNT(*) FROM youtube_channel_subscriptions s WHERE s.channel_id=c.channel_id AND s.upstream_state='active'),
 SUM(p.archive_active),SUM(p.watch_occurrence_count),MAX(p.latest_watched_at),SUM(p.queue_active),MAX(p.projection_generation),MAX(p.updated_at)
 FROM youtube_channels c JOIN video_library_projection p ON p.channel_id=c.channel_id
 WHERE p.archive_active=1 OR p.queue_active=1 GROUP BY c.channel_id;

CREATE TABLE youtube_published_video_profiles AS SELECT media_item_id,video_id,lookup_state,current_title,description,channel_id,channel_title,published_at,duration_ms,category_id,tags_json,caption_available,definition,projection,live_broadcast_content,actual_start_at,actual_end_at,fetched_at,checked_at,expires_at FROM youtube_video_catalog_profiles WHERE 0;
CREATE UNIQUE INDEX youtube_published_video_profiles_identity_idx ON youtube_published_video_profiles(media_item_id);
CREATE INDEX youtube_published_video_profiles_expiry_idx ON youtube_published_video_profiles(expires_at);
INSERT INTO youtube_published_video_profiles SELECT media_item_id,video_id,lookup_state,current_title,description,channel_id,channel_title,published_at,duration_ms,category_id,tags_json,caption_available,definition,projection,live_broadcast_content,actual_start_at,actual_end_at,fetched_at,checked_at,expires_at FROM youtube_video_catalog_profiles WHERE COALESCE((SELECT state FROM catalog_refresh_jobs WHERE provider='youtube' ORDER BY created_at DESC,id DESC LIMIT 1),'succeeded')='succeeded';

CREATE TABLE youtube_published_channel_profiles AS SELECT channel_id,current_title,description,custom_url,country,thumbnail_url,fetched_at,checked_at,expires_at FROM youtube_channel_catalog_profiles WHERE 0;
CREATE UNIQUE INDEX youtube_published_channel_profiles_identity_idx ON youtube_published_channel_profiles(channel_id);
CREATE INDEX youtube_published_channel_profiles_expiry_idx ON youtube_published_channel_profiles(expires_at);
INSERT INTO youtube_published_channel_profiles SELECT channel_id,current_title,description,custom_url,country,thumbnail_url,fetched_at,checked_at,expires_at FROM youtube_channel_catalog_profiles WHERE COALESCE((SELECT state FROM catalog_refresh_jobs WHERE provider='youtube' ORDER BY created_at DESC,id DESC LIMIT 1),'succeeded')='succeeded';

CREATE TABLE youtube_published_categories AS SELECT category_id,region_code,title,fetched_at,expires_at FROM youtube_categories WHERE 0;
CREATE UNIQUE INDEX youtube_published_categories_identity_idx ON youtube_published_categories(category_id,region_code);
CREATE INDEX youtube_published_categories_expiry_idx ON youtube_published_categories(expires_at);
INSERT INTO youtube_published_categories SELECT category_id,region_code,title,fetched_at,expires_at FROM youtube_categories WHERE COALESCE((SELECT state FROM catalog_refresh_jobs WHERE provider='youtube' ORDER BY created_at DESC,id DESC LIMIT 1),'succeeded')='succeeded';

CREATE TABLE youtube_published_thumbnails AS SELECT video_id,variant,url,width,height,fetched_at,expires_at FROM youtube_video_thumbnails WHERE 0;
CREATE UNIQUE INDEX youtube_published_thumbnails_identity_idx ON youtube_published_thumbnails(video_id,variant);
CREATE INDEX youtube_published_thumbnails_expiry_idx ON youtube_published_thumbnails(expires_at);
INSERT INTO youtube_published_thumbnails SELECT video_id,variant,url,width,height,fetched_at,expires_at FROM youtube_video_thumbnails WHERE COALESCE((SELECT state FROM catalog_refresh_jobs WHERE provider='youtube' ORDER BY created_at DESC,id DESC LIMIT 1),'succeeded')='succeeded';

CREATE INDEX youtube_published_video_association_expiry_idx ON youtube_published_video_profiles(expires_at,channel_id) WHERE channel_id IS NOT NULL;
CREATE TABLE youtube_published_channel_aggregates(
 channel_id TEXT PRIMARY KEY NOT NULL,channel_title TEXT,
 archive_video_count INTEGER NOT NULL,watch_occurrence_count INTEGER NOT NULL,latest_watched_at TEXT,
 queue_video_count INTEGER NOT NULL,projection_generation INTEGER NOT NULL,updated_at TEXT NOT NULL,expires_at TEXT NOT NULL);
CREATE INDEX youtube_published_channel_aggregates_expiry_idx ON youtube_published_channel_aggregates(expires_at);
INSERT INTO youtube_published_channel_aggregates(
 channel_id,channel_title,archive_video_count,watch_occurrence_count,latest_watched_at,queue_video_count,projection_generation,updated_at,expires_at)
 SELECT COALESCE(v.channel_id,p.channel_id),MAX(COALESCE(v.channel_title,p.display_channel_title)),
 SUM(p.archive_active),SUM(p.watch_occurrence_count),MAX(p.latest_watched_at),SUM(p.queue_active),MAX(p.projection_generation),MAX(p.updated_at),
 (SELECT MIN(expires_at) FROM youtube_published_video_profiles WHERE channel_id IS NOT NULL AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now'))
 FROM video_library_projection p LEFT JOIN youtube_published_video_profiles v ON v.media_item_id=p.media_item_id AND v.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE COALESCE(v.channel_id,p.channel_id) IS NOT NULL AND (p.archive_active=1 OR p.queue_active=1)
 AND EXISTS(SELECT 1 FROM youtube_published_video_profiles WHERE channel_id IS NOT NULL AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now'))
 GROUP BY COALESCE(v.channel_id,p.channel_id);

UPDATE youtube_publication_state SET last_published_job_id=(SELECT id FROM catalog_refresh_jobs WHERE provider='youtube' ORDER BY created_at DESC,id DESC LIMIT 1) WHERE COALESCE((SELECT state FROM catalog_refresh_jobs WHERE provider='youtube' ORDER BY created_at DESC,id DESC LIMIT 1),'succeeded')='succeeded';

CREATE TABLE youtube_search_expiry (
 document_kind TEXT NOT NULL CHECK(document_kind IN ('video','channel')),
 document_rowid INTEGER NOT NULL,expires_at TEXT NOT NULL,
 PRIMARY KEY(document_kind,document_rowid));
CREATE INDEX youtube_search_expiry_deadline_idx ON youtube_search_expiry(expires_at,document_kind,document_rowid);

DROP TABLE video_search;
CREATE VIRTUAL TABLE video_search USING fts5(
 media_item_id UNINDEXED,titles,channel_titles,origin_kind UNINDEXED,origin_key UNINDEXED,expires_at UNINDEXED,
 tokenize='unicode61 remove_diacritics 2');
DROP TABLE video_channel_search;
CREATE VIRTUAL TABLE video_channel_search USING fts5(
 channel_id UNINDEXED,titles,origin_kind UNINDEXED,origin_key UNINDEXED,expires_at UNINDEXED,
 tokenize='unicode61 remove_diacritics 2');
DELETE FROM video_search;
INSERT INTO video_search(media_item_id,titles,channel_titles,origin_kind,origin_key,expires_at)
 SELECT p.media_item_id,
   COALESCE((SELECT GROUP_CONCAT(DISTINCT w.historical_title) FROM youtube_watch_observations w WHERE w.media_item_id=p.media_item_id),p.display_title),
   COALESCE((SELECT GROUP_CONCAT(DISTINCT w.historical_channel_title) FROM youtube_watch_observations w WHERE w.media_item_id=p.media_item_id),p.display_channel_title,''),
   'owner',p.media_item_id,NULL FROM video_library_projection p;
INSERT INTO video_search(media_item_id,titles,channel_titles,origin_kind,origin_key,expires_at)
 SELECT p.media_item_id,COALESCE(v.current_title,'')||' '||COALESCE(v.description,'')||' '||COALESCE(v.tags_json,''),
 COALESCE(v.channel_title,''),'video',v.media_item_id,v.expires_at
 FROM video_library_projection p JOIN youtube_published_video_profiles v ON v.media_item_id=p.media_item_id;
INSERT INTO video_search(media_item_id,titles,channel_titles,origin_kind,origin_key,expires_at)
 SELECT DISTINCT p.media_item_id,'',c.current_title||' '||COALESCE(c.custom_url,''),'channel',c.channel_id,CASE WHEN c.channel_id=p.channel_id THEN c.expires_at ELSE MIN(c.expires_at,v.expires_at) END
 FROM video_library_projection p LEFT JOIN youtube_published_video_profiles v ON v.media_item_id=p.media_item_id
 JOIN youtube_published_channel_profiles c ON c.channel_id=p.channel_id OR c.channel_id=v.channel_id;
INSERT INTO video_search(media_item_id,titles,channel_titles,origin_kind,origin_key,expires_at)
 SELECT p.media_item_id,c.title,'','category',c.category_id,MIN(c.expires_at,v.expires_at)
 FROM video_library_projection p JOIN youtube_published_video_profiles v ON v.media_item_id=p.media_item_id
 JOIN youtube_published_categories c ON c.category_id=v.category_id AND c.region_code='US';
DELETE FROM video_channel_search;
INSERT INTO video_channel_search(channel_id,titles,origin_kind,origin_key,expires_at)
 SELECT p.channel_id,COALESCE((SELECT GROUP_CONCAT(DISTINCT a.title) FROM youtube_channel_assertions a WHERE a.channel_id=p.channel_id),p.display_title),
 'owner',p.channel_id,NULL FROM video_channel_projection p;
INSERT INTO video_channel_search(channel_id,titles,origin_kind,origin_key,expires_at)
 SELECT c.channel_id,c.current_title||' '||COALESCE(c.custom_url,'')||' '||COALESCE(c.description,''),
 'channel',c.channel_id,c.expires_at FROM youtube_published_channel_profiles c;
INSERT INTO video_channel_search(channel_id,titles,origin_kind,origin_key,expires_at)
 SELECT v.channel_id,COALESCE(v.channel_title,''),'video',v.media_item_id,v.expires_at
 FROM youtube_published_video_profiles v WHERE v.channel_id IS NOT NULL;
DELETE FROM youtube_search_expiry;
INSERT INTO youtube_search_expiry SELECT 'video',rowid,expires_at FROM video_search WHERE expires_at IS NOT NULL;
INSERT INTO youtube_search_expiry SELECT 'channel',rowid,expires_at FROM video_channel_search WHERE expires_at IS NOT NULL;
