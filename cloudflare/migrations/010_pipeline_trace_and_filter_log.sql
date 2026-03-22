-- Pipeline Trace: 每次 pipeline 执行的全链路快照
CREATE TABLE IF NOT EXISTS pipeline_trace (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL UNIQUE,
    run_date TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    status TEXT DEFAULT 'running',
    -- 三级漏斗数据
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
    -- 耗时（秒）
    fetch_duration REAL,
    rule_duration REAL,
    embedding_duration REAL,
    llm_duration REAL,
    total_duration REAL,
    -- 配置与快照
    config_snapshot TEXT,
    dynamic_keywords TEXT,
    active_strategy TEXT DEFAULT 'A',
    star_fallback_triggered INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pipeline_trace_run_date ON pipeline_trace(run_date);
CREATE INDEX IF NOT EXISTS idx_pipeline_trace_status ON pipeline_trace(status);

-- News Filter Log: 每条新闻在每个环节的决策详情
CREATE TABLE IF NOT EXISTS news_filter_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    news_hash TEXT NOT NULL,
    -- 三种关键词策略评分
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
    -- Embedding 阶段
    embedding_similarity REAL,
    embedding_matched_symbol TEXT,
    embedding_decision TEXT,
    -- LLM 阶段
    llm_keep INTEGER,
    llm_stars INTEGER,
    llm_type TEXT,
    llm_summary TEXT,
    llm_cot_reasoning TEXT,
    llm_raw_response TEXT,
    -- 最终决策
    final_decision TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_filter_log_run_id ON news_filter_log(run_id);
CREATE INDEX IF NOT EXISTS idx_filter_log_news_hash ON news_filter_log(news_hash);
CREATE INDEX IF NOT EXISTS idx_filter_log_final_decision ON news_filter_log(final_decision);
