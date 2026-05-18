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

INSERT INTO investment_accounts (name, broker, account_type, region, currency, enabled, sort_order, created_at, updated_at)
SELECT '老虎-美股', '老虎', 'stock', 'US', 'USD', 1, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM investment_accounts WHERE name = '老虎-美股');

INSERT INTO investment_accounts (name, broker, account_type, region, currency, enabled, sort_order, created_at, updated_at)
SELECT '东方财富-国内', '东方财富', 'stock', 'CN', 'CNY', 1, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM investment_accounts WHERE name = '东方财富-国内');

INSERT INTO investment_accounts (name, broker, account_type, region, currency, enabled, sort_order, created_at, updated_at)
SELECT '天天基金-国内', '天天基金', 'fund', 'CN', 'CNY', 1, 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM investment_accounts WHERE name = '天天基金-国内');

INSERT INTO investment_accounts (name, broker, account_type, region, currency, enabled, sort_order, notes, created_at, updated_at)
SELECT '未分配账户', '', 'mixed', '', 'CNY', 1, 999, '历史操作计划无法根据市场字段自动归属时使用。', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM investment_accounts WHERE name = '未分配账户');

CREATE TABLE IF NOT EXISTS daily_review_action_plans_v2 (
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

INSERT OR IGNORE INTO daily_review_action_plans_v2 (
    id, archive_date, account_id, symbol, action_type, entry_plan, take_profit_plan,
    stop_loss_plan, key_levels, support_levels, resistance_levels, current_position,
    thinking, sort_order, market_type, created_at, updated_at
)
SELECT
    p.id,
    p.archive_date,
    COALESCE(
        CASE
            WHEN p.market_type = '美股' THEN (SELECT id FROM investment_accounts WHERE name = '老虎-美股' LIMIT 1)
            WHEN p.market_type = '大A' THEN (SELECT id FROM investment_accounts WHERE name = '东方财富-国内' LIMIT 1)
            ELSE NULL
        END,
        (SELECT id FROM investment_accounts WHERE name = '未分配账户' LIMIT 1)
    ) AS account_id,
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
    p.created_at,
    p.updated_at
FROM daily_review_action_plans p;

DROP TABLE daily_review_action_plans;

ALTER TABLE daily_review_action_plans_v2 RENAME TO daily_review_action_plans;

CREATE INDEX IF NOT EXISTS idx_daily_review_action_plans_date
    ON daily_review_action_plans(archive_date, sort_order);

CREATE INDEX IF NOT EXISTS idx_daily_review_action_plans_symbol_date
    ON daily_review_action_plans(symbol, archive_date DESC);

CREATE INDEX IF NOT EXISTS idx_daily_review_action_plans_account_date
    ON daily_review_action_plans(account_id, archive_date DESC, sort_order);

CREATE INDEX IF NOT EXISTS idx_investment_accounts_enabled_sort
    ON investment_accounts(enabled, sort_order, id);
