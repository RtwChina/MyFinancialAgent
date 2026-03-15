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

CREATE TABLE IF NOT EXISTS stock_news_raw (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pub_date DATETIME,
    title TEXT,
    summary TEXT,
    content TEXT,
    url TEXT,
    source TEXT,
    type TEXT,
    ai_summary TEXT,
    news_hash TEXT,
    captured_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(news_hash)
);

CREATE TABLE IF NOT EXISTS stock_archive (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    archive_date TEXT NOT NULL,
    review_status TEXT NOT NULL DEFAULT 'draft',
    hist_price_level TEXT,
    news_summary TEXT,
    market_sentiment TEXT,
    sector_rotation TEXT,
    asset_plan TEXT,
    custom_notes TEXT,
    trading_summary TEXT,
    source_snapshot_json TEXT,
    carry_forward_from_date TEXT,
    reviewed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(archive_date)
);

CREATE TABLE IF NOT EXISTS news_analysis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    analysis_date TEXT NOT NULL,
    global_news TEXT,
    market_news TEXT,
    market_analysis TEXT,
    raw_summary TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stock_raw_date ON stock_raw(k_date);
CREATE INDEX IF NOT EXISTS idx_stock_raw_symbol ON stock_raw(symbol);
CREATE INDEX IF NOT EXISTS idx_stock_news_pub_date ON stock_news_raw(pub_date);
CREATE INDEX IF NOT EXISTS idx_stock_news_source ON stock_news_raw(source);
CREATE INDEX IF NOT EXISTS idx_stock_news_type ON stock_news_raw(type);
CREATE INDEX IF NOT EXISTS idx_stock_archive_date ON stock_archive(archive_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_archive_unique_date ON stock_archive(archive_date);
CREATE INDEX IF NOT EXISTS idx_stock_archive_status_date ON stock_archive(review_status, archive_date);
CREATE INDEX IF NOT EXISTS idx_news_analysis_date ON news_analysis(analysis_date);
