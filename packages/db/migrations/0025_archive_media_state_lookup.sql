-- Per-media occurrence counts and date bounds must not scan all active Archive
-- entries through archive_entries_state_id_idx. Cover both equality predicates
-- and the consumed date so the planner can bound COUNT/MAX/range lookups.
CREATE INDEX archive_entries_media_state_consumed_idx
  ON archive_entries(media_item_id,upstream_state,consumed_at_value);
