UPDATE news_raw_data
SET type = 'index'
WHERE type IN ('macro', 'market');

UPDATE news_raw_data
SET type = 'stock'
WHERE type = 'symbol';

UPDATE daily_review_archive_news
SET type = 'index'
WHERE type IN ('macro', 'market');

UPDATE daily_review_archive_news
SET type = 'stock'
WHERE type = 'symbol';
