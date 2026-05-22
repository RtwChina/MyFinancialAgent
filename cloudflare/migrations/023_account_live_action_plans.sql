CREATE TABLE IF NOT EXISTS account_live_action_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    UNIQUE(account_id, symbol)
);

CREATE INDEX IF NOT EXISTS idx_account_live_action_plans_account
    ON account_live_action_plans(account_id, sort_order, id);

CREATE INDEX IF NOT EXISTS idx_account_live_action_plans_symbol
    ON account_live_action_plans(symbol);

INSERT OR IGNORE INTO account_live_action_plans (
    account_id, symbol, action_type, entry_plan, take_profit_plan,
    stop_loss_plan, key_levels, support_levels, resistance_levels,
    current_position, thinking, sort_order, market_type, created_at, updated_at
)
SELECT
    p.account_id,
    p.symbol,
    p.action_type,
    p.entry_plan,
    p.take_profit_plan,
    p.stop_loss_plan,
    p.key_levels,
    p.support_levels,
    p.resistance_levels,
    p.current_position,
    p.thinking,
    p.sort_order,
    p.market_type,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM daily_review_action_plans p
JOIN (
    SELECT MAX(a.archive_date) AS archive_date
    FROM daily_review_archive a
    WHERE a.review_status = 'reviewed'
) latest ON latest.archive_date = p.archive_date;
