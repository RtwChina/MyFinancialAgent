CREATE TABLE IF NOT EXISTS daily_review_archive__new (
    archive_date TEXT PRIMARY KEY,
    review_status TEXT NOT NULL DEFAULT 'draft',
    reviewer_news_notes TEXT,
    market_sentiment TEXT,
    sector_rotation TEXT,
    asset_plan TEXT,
    trading_summary TEXT,
    reviewed_at DATETIME,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO daily_review_archive__new (
    archive_date, review_status, reviewer_news_notes, market_sentiment,
    sector_rotation, asset_plan, trading_summary, reviewed_at, updated_at
)
SELECT
    archive_date,
    review_status,
    reviewer_news_notes,
    market_sentiment,
    sector_rotation,
    asset_plan,
    trading_summary,
    reviewed_at,
    updated_at
FROM daily_review_archive;

DROP TABLE daily_review_archive;
ALTER TABLE daily_review_archive__new RENAME TO daily_review_archive;

CREATE INDEX IF NOT EXISTS idx_daily_review_archive_date ON daily_review_archive(archive_date);
CREATE INDEX IF NOT EXISTS idx_daily_review_archive_status_date ON daily_review_archive(review_status, archive_date);
