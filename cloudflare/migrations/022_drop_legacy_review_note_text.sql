ALTER TABLE daily_review_snapshots
  ADD COLUMN market_sentiment_blocks_json TEXT;

ALTER TABLE daily_review_snapshots
  ADD COLUMN sector_rotation_blocks_json TEXT;

UPDATE daily_review_snapshots
SET market_sentiment_blocks_json = (
  SELECT market_sentiment_blocks_json
  FROM daily_review_archive
  WHERE daily_review_archive.archive_date = daily_review_snapshots.archive_date
)
WHERE market_sentiment_blocks_json IS NULL;

UPDATE daily_review_snapshots
SET sector_rotation_blocks_json = (
  SELECT sector_rotation_blocks_json
  FROM daily_review_archive
  WHERE daily_review_archive.archive_date = daily_review_snapshots.archive_date
)
WHERE sector_rotation_blocks_json IS NULL;

ALTER TABLE daily_review_archive
  DROP COLUMN market_sentiment;

ALTER TABLE daily_review_archive
  DROP COLUMN sector_rotation;

ALTER TABLE daily_review_snapshots
  DROP COLUMN market_sentiment;

ALTER TABLE daily_review_snapshots
  DROP COLUMN sector_rotation;
