-- Prefer the reliably served 16:9 medium rendition in existing projections.
-- The normal projection rebuild applies the same ordering for future refreshes.
UPDATE video_library_projection
SET image_url = (
  SELECT t.url
  FROM youtube_video_thumbnails t
  WHERE t.video_id = video_library_projection.video_id
  ORDER BY CASE t.variant
    WHEN 'medium' THEN 0
    WHEN 'high' THEN 1
    WHEN 'standard' THEN 2
    WHEN 'maxres' THEN 3
    WHEN 'default' THEN 4
    ELSE 5
  END, COALESCE(t.width, 0) * COALESCE(t.height, 0) DESC
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1 FROM youtube_video_thumbnails t
  WHERE t.video_id = video_library_projection.video_id
);
