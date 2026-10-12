-- Video rollups repeatedly validate occurrence membership. Keep the state and
-- identity together so those joins do not fetch full canonical event rows.
CREATE INDEX archive_entries_state_id_idx ON archive_entries(upstream_state,id);
