-- 远端 D1 全量重建脚本。
-- 按当前精简 schema 删除旧表并重建，顺手清掉历史脏数据。

DROP TABLE IF EXISTS news_analysis;
DROP TABLE IF EXISTS stock_archive;
DROP TABLE IF EXISTS stock_news_raw;
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

CREATE TABLE stock_news_raw (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pub_date DATETIME,
    title TEXT,
    content TEXT,
    url TEXT,
    source TEXT,
    type TEXT,
    rule_passed INTEGER DEFAULT 0,
    rule_score REAL DEFAULT 0,
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

CREATE TABLE stock_archive (
    archive_date TEXT PRIMARY KEY,
    review_status TEXT NOT NULL DEFAULT 'draft',
    news_brief TEXT,
    selected_news_ids TEXT,
    market_sentiment TEXT,
    sector_rotation TEXT,
    asset_plan TEXT,
    trading_summary TEXT,
    reviewed_at DATETIME,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE news_analysis (
    analysis_date TEXT PRIMARY KEY,
    global_news TEXT,
    market_news TEXT,
    symbol_news TEXT,
    market_analysis TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_stock_raw_date ON stock_raw(k_date);
CREATE INDEX idx_stock_raw_symbol ON stock_raw(symbol);
CREATE INDEX idx_stock_news_pub_date ON stock_news_raw(pub_date);
CREATE INDEX idx_stock_news_source ON stock_news_raw(source);
CREATE INDEX idx_stock_news_type ON stock_news_raw(type);
CREATE INDEX idx_stock_news_rule_passed ON stock_news_raw(rule_passed);
CREATE INDEX idx_stock_news_status ON stock_news_raw(processing_status);
CREATE INDEX idx_stock_news_relevant ON stock_news_raw(is_relevant_to_review);
CREATE INDEX idx_stock_archive_date ON stock_archive(archive_date);
CREATE INDEX idx_stock_archive_status_date ON stock_archive(review_status, archive_date);
CREATE INDEX idx_news_analysis_date ON news_analysis(analysis_date);
