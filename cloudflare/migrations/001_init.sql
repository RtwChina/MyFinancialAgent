-- Cloudflare D1 初始化脚本
-- 与根目录 schema.sql 保持一致

CREATE TABLE IF NOT EXISTS stock_raw (
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

CREATE TABLE IF NOT EXISTS news_raw_data (
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

CREATE TABLE IF NOT EXISTS daily_review_archive (
    archive_date TEXT PRIMARY KEY,
    review_status TEXT NOT NULL DEFAULT 'draft',
    news_brief TEXT,
    market_sentiment TEXT,
    sector_rotation TEXT,
    asset_plan TEXT,
    trading_summary TEXT,
    reviewed_at DATETIME,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS daily_news_ai_analysis (
    analysis_date TEXT PRIMARY KEY,
    daily_major_events TEXT,
    sector_impact_map TEXT,
    linkage_logic_chain TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stock_raw_date ON stock_raw(k_date);
CREATE INDEX IF NOT EXISTS idx_stock_raw_symbol ON stock_raw(symbol);
CREATE INDEX IF NOT EXISTS idx_news_raw_data_pub_date ON news_raw_data(pub_date);
CREATE INDEX IF NOT EXISTS idx_news_raw_data_source ON news_raw_data(source);
CREATE INDEX IF NOT EXISTS idx_news_raw_data_type ON news_raw_data(type);
CREATE INDEX IF NOT EXISTS idx_news_raw_data_rule_passed ON news_raw_data(rule_passed);
CREATE INDEX IF NOT EXISTS idx_news_raw_data_status ON news_raw_data(processing_status);
CREATE INDEX IF NOT EXISTS idx_news_raw_data_relevant ON news_raw_data(is_relevant_to_review);
CREATE INDEX IF NOT EXISTS idx_daily_review_archive_date ON daily_review_archive(archive_date);
CREATE INDEX IF NOT EXISTS idx_daily_review_archive_status_date ON daily_review_archive(review_status, archive_date);
CREATE INDEX IF NOT EXISTS idx_daily_news_ai_analysis_date ON daily_news_ai_analysis(analysis_date);
