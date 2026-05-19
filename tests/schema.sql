-- Consolidated schema after migrations 001–010
-- Generated from cloudflare/migrations/*.sql
-- Uses CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS only

-- ============================================================
-- stock_raw: 每日股价快照
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_raw (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    k_date TEXT NOT NULL,
    stock_name TEXT,
    symbol TEXT NOT NULL,
    yahoo_symbol TEXT,
    current_price REAL,
    change_percent REAL,
    volume INTEGER,
    captured_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(k_date, symbol)
);

CREATE INDEX IF NOT EXISTS idx_stock_raw_date ON stock_raw(k_date);
CREATE INDEX IF NOT EXISTS idx_stock_raw_symbol ON stock_raw(symbol);
CREATE INDEX IF NOT EXISTS idx_stock_raw_yahoo_symbol ON stock_raw(yahoo_symbol);

-- ============================================================
-- news_raw_data: 原始新闻
-- ============================================================
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
    language TEXT DEFAULT 'zh',
    sub_source TEXT DEFAULT '',
    captured_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(news_hash)
);

CREATE INDEX IF NOT EXISTS idx_news_raw_data_pub_date ON news_raw_data(pub_date);
CREATE INDEX IF NOT EXISTS idx_news_raw_data_source ON news_raw_data(source);
CREATE INDEX IF NOT EXISTS idx_news_raw_data_type ON news_raw_data(type);
CREATE INDEX IF NOT EXISTS idx_news_raw_data_rule_passed ON news_raw_data(rule_passed);
CREATE INDEX IF NOT EXISTS idx_news_raw_data_status ON news_raw_data(processing_status);
CREATE INDEX IF NOT EXISTS idx_news_raw_data_relevant ON news_raw_data(is_relevant_to_review);

-- ============================================================
-- daily_review_archive: 每日复盘归档
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_review_archive (
    archive_date TEXT PRIMARY KEY,
    review_status TEXT NOT NULL DEFAULT 'draft',
    reviewer_news_notes TEXT,
    market_sentiment_blocks_json TEXT,
    sector_rotation_blocks_json TEXT,
    trading_summary TEXT,
    reviewed_at DATETIME,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_daily_review_archive_date ON daily_review_archive(archive_date);
CREATE INDEX IF NOT EXISTS idx_daily_review_archive_status_date ON daily_review_archive(review_status, archive_date);

-- ============================================================
-- review_account_snapshots: 复盘日账户快照
-- ============================================================
CREATE TABLE IF NOT EXISTS review_account_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    archive_date TEXT NOT NULL UNIQUE,
    accounts_snapshot TEXT NOT NULL,
    snapshot_source TEXT NOT NULL DEFAULT 'manual_review',
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_review_account_snapshots_date
    ON review_account_snapshots(archive_date);

-- ============================================================
-- investment_accounts: 股票/基金账户管理
-- ============================================================
CREATE TABLE IF NOT EXISTS investment_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    broker TEXT,
    account_type TEXT NOT NULL DEFAULT 'stock',
    region TEXT,
    currency TEXT NOT NULL DEFAULT 'CNY',
    total_assets REAL,
    available_cash REAL,
    enabled INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name)
);

CREATE INDEX IF NOT EXISTS idx_investment_accounts_enabled_sort
    ON investment_accounts(enabled, sort_order, id);

INSERT INTO investment_accounts (name, broker, account_type, region, currency, enabled, sort_order)
VALUES
    ('老虎-美股', '老虎', 'stock', 'US', 'USD', 1, 10),
    ('东方财富-国内', '东方财富', 'stock', 'CN', 'CNY', 1, 20),
    ('天天基金-国内', '天天基金', 'fund', 'CN', 'CNY', 1, 30),
    ('未分配账户', '', 'mixed', '', 'CNY', 1, 999)
ON CONFLICT(name) DO NOTHING;

-- ============================================================
-- daily_review_action_plans: 结构化操作计划
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_review_action_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    archive_date TEXT NOT NULL,
    account_id INTEGER NOT NULL,
    symbol TEXT NOT NULL,
    action_type TEXT,
    entry_plan TEXT,
    take_profit_plan TEXT,
    stop_loss_plan TEXT,
    key_levels TEXT,
    support_levels TEXT,
    resistance_levels TEXT,
    current_position TEXT,
    thinking TEXT,
    sort_order INTEGER DEFAULT 0,
    market_type TEXT DEFAULT '美股',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(archive_date, account_id, symbol)
);

CREATE INDEX IF NOT EXISTS idx_daily_review_action_plans_date
    ON daily_review_action_plans(archive_date, sort_order);
CREATE INDEX IF NOT EXISTS idx_daily_review_action_plans_symbol_date
    ON daily_review_action_plans(symbol, archive_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_review_action_plans_account_date
    ON daily_review_action_plans(account_id, archive_date DESC, sort_order);

-- ============================================================
-- daily_news_ai_analysis: AI 新闻分析
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_news_ai_analysis (
    analysis_date TEXT PRIMARY KEY,
    daily_major_events TEXT,
    sector_impact_map TEXT,
    linkage_logic_chain TEXT,
    source_news_ids TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_daily_news_ai_analysis_date ON daily_news_ai_analysis(analysis_date);

-- ============================================================
-- daily_review_archive_news: 复盘新闻快照
-- ============================================================
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

-- ============================================================
-- tracked_symbols: 标的管理
-- ============================================================
CREATE TABLE IF NOT EXISTS tracked_symbols (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL UNIQUE,
    yahoo_symbol TEXT,
    display_name TEXT NOT NULL,
    symbol_type TEXT NOT NULL
        CHECK(symbol_type IN ('index', 'sector', 'stock')),
    aliases TEXT DEFAULT '[]',
    is_active INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tracked_symbols_type ON tracked_symbols(symbol_type);
CREATE INDEX IF NOT EXISTS idx_tracked_symbols_active ON tracked_symbols(is_active);

-- ============================================================
-- pipeline_trace: Pipeline 执行全链路快照
-- ============================================================
CREATE TABLE IF NOT EXISTS pipeline_trace (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL UNIQUE,
    run_date TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    status TEXT DEFAULT 'running',
    total_fetched INTEGER DEFAULT 0,
    total_deduped INTEGER DEFAULT 0,
    rule_passed INTEGER DEFAULT 0,
    rule_filtered INTEGER DEFAULT 0,
    embedding_input INTEGER DEFAULT 0,
    embedding_passed INTEGER DEFAULT 0,
    embedding_filtered INTEGER DEFAULT 0,
    llm_input INTEGER DEFAULT 0,
    llm_kept INTEGER DEFAULT 0,
    llm_discarded INTEGER DEFAULT 0,
    final_count INTEGER DEFAULT 0,
    fetch_duration REAL,
    rule_duration REAL,
    embedding_duration REAL,
    llm_duration REAL,
    total_duration REAL,
    config_snapshot TEXT,
    dynamic_keywords TEXT,
    active_strategy TEXT DEFAULT 'A',
    star_fallback_triggered INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pipeline_trace_run_date ON pipeline_trace(run_date);
CREATE INDEX IF NOT EXISTS idx_pipeline_trace_status ON pipeline_trace(status);

-- ============================================================
-- news_filter_log: 新闻过滤决策日志
-- ============================================================
CREATE TABLE IF NOT EXISTS news_filter_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    news_hash TEXT NOT NULL,
    strategy_a_score REAL,
    strategy_b_score REAL,
    strategy_c_score REAL,
    active_strategy TEXT,
    rule_threshold REAL,
    macro_hits TEXT,
    market_hits TEXT,
    noise_hits TEXT,
    symbol_hits TEXT,
    focus_hits TEXT,
    rule_decision TEXT,
    rule_reason TEXT,
    embedding_similarity REAL,
    embedding_matched_symbol TEXT,
    embedding_decision TEXT,
    llm_keep INTEGER,
    llm_stars INTEGER,
    llm_type TEXT,
    llm_summary TEXT,
    llm_cot_reasoning TEXT,
    llm_raw_response TEXT,
    final_decision TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_filter_log_run_id ON news_filter_log(run_id);
CREATE INDEX IF NOT EXISTS idx_filter_log_news_hash ON news_filter_log(news_hash);
CREATE INDEX IF NOT EXISTS idx_filter_log_final_decision ON news_filter_log(final_decision);

-- ============================================================
-- screening_keywords: 初筛关键词管理
-- ============================================================
CREATE TABLE IF NOT EXISTS screening_keywords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    keyword TEXT NOT NULL,
    keyword_type TEXT NOT NULL
        CHECK(keyword_type IN ('macro', 'market', 'noise', 'symbol_context')),
    language TEXT NOT NULL DEFAULT 'zh'
        CHECK(language IN ('zh', 'en')),
    is_active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(keyword, keyword_type)
);

CREATE INDEX IF NOT EXISTS idx_screening_keywords_type ON screening_keywords(keyword_type);
CREATE INDEX IF NOT EXISTS idx_screening_keywords_active ON screening_keywords(is_active);
