CREATE TABLE IF NOT EXISTS daily_review_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    archive_date TEXT NOT NULL,
    version_no INTEGER NOT NULL,
    snapshot_reason TEXT,
    review_status TEXT NOT NULL DEFAULT 'initialized',
    reviewer_news_notes TEXT,
    market_sentiment TEXT,
    sector_rotation TEXT,
    asset_plan TEXT,
    trading_summary TEXT,
    reviewed_at DATETIME,
    source_updated_at DATETIME,
    snapshot_created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(archive_date, version_no)
);

CREATE TABLE IF NOT EXISTS daily_news_ai_analysis_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    analysis_date TEXT NOT NULL,
    version_no INTEGER NOT NULL,
    snapshot_reason TEXT,
    daily_major_events TEXT,
    sector_impact_map TEXT,
    linkage_logic_chain TEXT,
    source_news_ids TEXT,
    source_updated_at DATETIME,
    snapshot_created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(analysis_date, version_no)
);

CREATE INDEX IF NOT EXISTS idx_daily_review_snapshots_date
    ON daily_review_snapshots(archive_date);
CREATE INDEX IF NOT EXISTS idx_daily_review_snapshots_date_version
    ON daily_review_snapshots(archive_date, version_no DESC);
CREATE INDEX IF NOT EXISTS idx_daily_review_snapshots_created_at
    ON daily_review_snapshots(snapshot_created_at DESC);

CREATE INDEX IF NOT EXISTS idx_daily_news_ai_analysis_snapshots_date
    ON daily_news_ai_analysis_snapshots(analysis_date);
CREATE INDEX IF NOT EXISTS idx_daily_news_ai_analysis_snapshots_date_version
    ON daily_news_ai_analysis_snapshots(analysis_date, version_no DESC);
CREATE INDEX IF NOT EXISTS idx_daily_news_ai_analysis_snapshots_created_at
    ON daily_news_ai_analysis_snapshots(snapshot_created_at DESC);
