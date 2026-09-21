INSERT INTO youtube_takeout_component_heads(
  connection_id,
  component_kind,
  raw_object_id,
  acquired_at,
  finalized_at
)
SELECT connection_id, component_kind, raw_object_id, acquired_at, finalized_at
FROM (
  SELECT
    c.connection_id,
    c.component_kind,
    c.raw_object_id,
    r.acquired_at,
    COALESCE(c.finalized_at, c.completed_at, r.acquired_at) AS finalized_at,
    ROW_NUMBER() OVER (
      PARTITION BY c.connection_id, c.component_kind
      ORDER BY r.acquired_at DESC, c.raw_object_id DESC
    ) AS position
  FROM youtube_takeout_components c
  JOIN raw_objects r ON r.id = c.raw_object_id
  WHERE c.component_kind IN ('watch_later', 'subscriptions')
    AND c.status = 'complete'
)
WHERE position = 1
ON CONFLICT(connection_id, component_kind) DO UPDATE SET
  raw_object_id = excluded.raw_object_id,
  acquired_at = excluded.acquired_at,
  finalized_at = excluded.finalized_at
WHERE excluded.acquired_at > youtube_takeout_component_heads.acquired_at
   OR (
     excluded.acquired_at = youtube_takeout_component_heads.acquired_at
     AND excluded.raw_object_id > youtube_takeout_component_heads.raw_object_id
   );
