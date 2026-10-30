-- Artist credits from track responses do not include artist photos.
-- Keep exact artist-catalog acquisition distinct from credit observation time.
ALTER TABLE spotify_song_artists ADD COLUMN image_url TEXT;
ALTER TABLE spotify_song_artists ADD COLUMN artwork_state TEXT NOT NULL DEFAULT 'pending'
  CHECK (artwork_state IN ('pending','available','unavailable'));
ALTER TABLE spotify_song_artists ADD COLUMN artwork_observed_at TEXT;
CREATE INDEX spotify_song_artist_artwork_state_idx ON spotify_song_artists(artwork_state,id);
