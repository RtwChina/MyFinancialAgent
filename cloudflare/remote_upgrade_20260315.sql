-- 远端 D1 全量重建脚本。
-- 按当前精简 schema 删除旧表并重建，顺手清掉历史脏数据。

DROP TABLE IF EXISTS daily_news_ai_analysis;
DROP TABLE IF EXISTS daily_review_archive;
DROP TABLE IF EXISTS news_raw_data;
DROP TABLE IF EXISTS stock_raw;

CREATE TABLE stock_raw (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    k_date TEXT NOT NULL,
    stock_code TEXT,
    stock_name TEXT,
    symbol TEXT NOT NULL,
    current_price REAL,
    change_percent REAL,
    volume INTEGER,
    captured_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(k_date, symbol)
);

CREATE TABLE news_raw_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pub_date DATETIME,
    title TEXT,
    content TEXT,
    url TEXT,
    source TEXT,
    type TEXT,
    rule_passed INTEGER DEFAULT 0,
    rule_reason TEXT,
    processing_status TEXT DEFAULT 'rule_screened',
    ai_summary TEXT,
    market_impact TEXT,
    importance_stars INTEGER DEFAULT 0,
    related_symbols TEXT,
    is_relevant_to_review INTEGER DEFAULT 0,
    news_hash TEXT,
    captured_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(news_hash)
);

CREATE TABLE daily_review_archive (
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

CREATE TABLE daily_news_ai_analysis (
    analysis_date TEXT PRIMARY KEY,
    daily_major_events TEXT,
    sector_impact_map TEXT,
    linkage_logic_chain TEXT,
    source_news_ids TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE daily_review_archive_news (
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

CREATE INDEX idx_stock_raw_date ON stock_raw(k_date);
CREATE INDEX idx_stock_raw_symbol ON stock_raw(symbol);
CREATE INDEX idx_news_raw_data_pub_date ON news_raw_data(pub_date);
CREATE INDEX idx_news_raw_data_source ON news_raw_data(source);
CREATE INDEX idx_news_raw_data_type ON news_raw_data(type);
CREATE INDEX idx_news_raw_data_rule_passed ON news_raw_data(rule_passed);
CREATE INDEX idx_news_raw_data_status ON news_raw_data(processing_status);
CREATE INDEX idx_news_raw_data_relevant ON news_raw_data(is_relevant_to_review);
CREATE INDEX idx_daily_review_archive_date ON daily_review_archive(archive_date);
CREATE INDEX idx_daily_review_archive_status_date ON daily_review_archive(review_status, archive_date);
CREATE INDEX idx_daily_news_ai_analysis_date ON daily_news_ai_analysis(analysis_date);
CREATE INDEX idx_daily_review_archive_news_date ON daily_review_archive_news(archive_date);
