CREATE TABLE youtube_takeout_component_heads (
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE RESTRICT,
  component_kind TEXT NOT NULL CHECK (component_kind IN ('watch_later','subscriptions')),
  raw_object_id TEXT NOT NULL REFERENCES raw_objects(id) ON DELETE RESTRICT,
  acquired_at TEXT NOT NULL,
  finalized_at TEXT NOT NULL,
  PRIMARY KEY (connection_id, component_kind),
  FOREIGN KEY (raw_object_id, component_kind)
    REFERENCES youtube_takeout_components(raw_object_id, component_kind) ON DELETE RESTRICT
);

CREATE TABLE youtube_watch_later_snapshot_members (
  raw_object_id TEXT NOT NULL REFERENCES raw_objects(id) ON DELETE RESTRICT,
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE RESTRICT,
  video_id TEXT NOT NULL,
  media_item_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE RESTRICT,
  queue_entry_id TEXT NOT NULL,
  source_record_id TEXT NOT NULL REFERENCES source_records(id) ON DELETE RESTRICT,
  membership_evidence_id TEXT NOT NULL,
  added_evidence_id TEXT,
  added_at TEXT,
  staged_at TEXT NOT NULL,
  PRIMARY KEY (raw_object_id, video_id)
);
CREATE INDEX youtube_watch_later_snapshot_connection_idx
  ON youtube_watch_later_snapshot_members(connection_id, raw_object_id, video_id);

CREATE TABLE youtube_subscription_snapshot_members (
  raw_object_id TEXT NOT NULL REFERENCES raw_objects(id) ON DELETE RESTRICT,
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE RESTRICT,
  channel_id TEXT NOT NULL REFERENCES youtube_channels(channel_id) ON DELETE RESTRICT,
  source_record_id TEXT NOT NULL REFERENCES source_records(id) ON DELETE RESTRICT,
  channel_title TEXT,
  channel_url TEXT,
  staged_at TEXT NOT NULL,
  PRIMARY KEY (raw_object_id, channel_id)
);
CREATE INDEX youtube_subscription_snapshot_connection_idx
  ON youtube_subscription_snapshot_members(connection_id, raw_object_id, channel_id);
