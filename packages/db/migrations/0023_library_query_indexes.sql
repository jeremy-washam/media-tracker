-- Browse counts and rollups must not scan the track table once per album.
CREATE INDEX spotify_song_tracks_album_idx ON spotify_song_tracks(album_id,media_item_id);

-- Cover the observation fields used by collection rollups without repeatedly
-- fetching the larger source rows. The chronological history indexes remain.
CREATE INDEX spotify_song_observations_rollup_idx
  ON spotify_song_observations(media_item_id,source_kind,occurred_at,milliseconds_played);
CREATE INDEX youtube_watch_rollup_idx
  ON youtube_watch_observations(media_item_id,archive_entry_id,connection_id,occurred_at,product);
