ALTER TABLE daily_review_archive
  ADD COLUMN market_sentiment_blocks_json TEXT;

ALTER TABLE daily_review_archive
  ADD COLUMN sector_rotation_blocks_json TEXT;
