CREATE TABLE IF NOT EXISTS daily_review_action_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    archive_date TEXT NOT NULL,
    symbol TEXT NOT NULL,
    action_type TEXT,
    entry_plan TEXT,
    take_profit_plan TEXT,
    stop_loss_plan TEXT,
    key_levels TEXT,
    current_position TEXT,
    thinking TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(archive_date, symbol)
);

CREATE INDEX IF NOT EXISTS idx_daily_review_action_plans_date
    ON daily_review_action_plans(archive_date, sort_order);

CREATE INDEX IF NOT EXISTS idx_daily_review_action_plans_symbol_date
    ON daily_review_action_plans(symbol, archive_date DESC);
