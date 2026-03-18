ALTER TABLE daily_review_archive RENAME COLUMN news_brief TO reviewer_news_notes;
ALTER TABLE daily_news_ai_analysis ADD COLUMN source_news_ids TEXT;
CREATE TABLE IF NOT EXISTS daily_review_archive_news (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    archive_date TEXT NOT NULL,
    original_news_id INTEGER,
    pub_date DATETIME,
    title TEXT,
    content TEXT,
    url TEXT,
    source TEXT,
    type TEXT,
    rule_passed INTEGER DEFAULT 0,
    rule_reason TEXT,
    processing_status TEXT,
    ai_summary TEXT,
    market_impact TEXT,
    importance_stars INTEGER DEFAULT 0,
    related_symbols TEXT,
    news_hash TEXT,
    archived_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(archive_date, news_hash)
);

CREATE INDEX IF NOT EXISTS idx_daily_review_archive_news_date ON daily_review_archive_news(archive_date);
