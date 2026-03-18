-- 股票数据自动化复盘系统数据库结构
-- 适用于 Cloudflare D1 (SQLite 兼容)
-- 版本: v3.0

-- ============================================================
-- 表 A：原始价格表
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_raw (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    k_date TEXT NOT NULL,              -- K线日期 (交易日期 YYYY-MM-DD)
    stock_code TEXT,                   -- 股票代码 (如 MU, MSFT)
    stock_name TEXT,                   -- 股票名称
    symbol TEXT NOT NULL,              -- 交易符号
    current_price REAL,                -- 收盘价
    change_percent REAL,               -- 涨跌幅 (%) - 相比前一日收盘价
    volume INTEGER,                    -- 成交量
    captured_at DATETIME,              -- 数据保存时间 (脚本采集时间)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,  -- 记录创建时间
    UNIQUE(k_date, symbol)             -- 防止同一天同一标的重复插入
);

-- ============================================================
-- 表 B：原始新闻表
-- 说明: 新闻数据持续积累，不做删除
-- 时间字段:
--   - pub_date: 新闻发布时间 (用于复盘时按时间范围筛选)
--   - captured_at: 数据保存时间 (脚本采集时间)
--   - created_at: 记录创建时间
-- ============================================================
CREATE TABLE IF NOT EXISTS news_raw_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pub_date DATETIME,                 -- 新闻发布时间 (重要: 复盘时按此时间筛选)
    title TEXT,                        -- 标题
    content TEXT,                      -- 正文
    url TEXT,                          -- 链接
    source TEXT,                       -- 来源: sina/cls_cn/jin10/yahoo_finance
    type TEXT,                         -- 类型: index(大盘) / sector(板块) / stock(个股)
    rule_passed INTEGER DEFAULT 0,     -- 是否通过规则初筛
    rule_reason TEXT,                  -- 规则保留原因
    processing_status TEXT DEFAULT 'rule_screened', -- 状态: rule_screened/llm_processed/llm_discarded/reviewed
    ai_summary TEXT,                   -- AI总结 (LLM对单条新闻的总结)
    market_impact TEXT,                -- 对市场影响概述
    importance_stars INTEGER DEFAULT 0, -- 重要程度星级: 0-5
    related_symbols TEXT,              -- 归属标的列表(JSON)
    is_relevant_to_review INTEGER DEFAULT 0, -- 是否建议纳入复盘
    news_hash TEXT,                    -- 唯一标识 (用于去重)
    captured_at DATETIME,              -- 数据保存时间 (脚本采集时间)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,  -- 记录创建时间
    UNIQUE(news_hash)                  -- 防止重复新闻
);

-- ============================================================
-- 表 C：复盘存档表
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_review_archive (
    archive_date TEXT PRIMARY KEY,     -- 复盘日期
    review_status TEXT NOT NULL DEFAULT 'draft', -- 状态: draft/reviewed/deleted
    reviewer_news_notes TEXT,         -- 复盘人对新闻的总结与点评（可编辑）
    market_sentiment TEXT,             -- 大盘流动性追踪
    sector_rotation TEXT,              -- 大宗商品与板块轮动
    asset_plan TEXT,                   -- 个股与资产操作计划
    trading_summary TEXT,              -- 深度思考与交易总结
    reviewed_at DATETIME,              -- 完成复盘时间
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 表 D：新闻分析结果表 (LLM 筛选的重大新闻)
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_news_ai_analysis (
    analysis_date TEXT PRIMARY KEY,    -- 分析日期 (YYYY-MM-DD)
    daily_major_events TEXT,           -- 今日大事概览（综合后的主线事件）
    sector_impact_map TEXT,            -- 大盘与重点板块影响图谱
    linkage_logic_chain TEXT,          -- 联动逻辑链
    source_news_ids TEXT,              -- 生成本次 AI 日总结所使用的新闻 ID 列表(JSON)
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS daily_review_archive_news (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    archive_date TEXT NOT NULL,        -- 复盘日期
    original_news_id INTEGER,          -- 原始新闻 ID（来自 news_raw_data）
    pub_date DATETIME,
    title TEXT,
    content TEXT,
    url TEXT,
    source TEXT,
    type TEXT,                         -- 类型: index / sector / stock
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

-- ============================================================
-- 表 E：标的管理表
-- ============================================================
CREATE TABLE IF NOT EXISTS tracked_symbols (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL UNIQUE,        -- 系统唯一标识，人类友好（如 GSPC、VIX、MU）
    yahoo_symbol TEXT,                  -- Yahoo Finance 代码（为空则等同于 symbol）
    display_name TEXT NOT NULL,         -- 中文显示名
    symbol_type TEXT NOT NULL           -- 'index'(大盘) / 'sector'(板块) / 'stock'(个股)
        CHECK(symbol_type IN ('index', 'sector', 'stock')),
    aliases TEXT DEFAULT '[]',          -- JSON 数组，新闻匹配别名
    is_active INTEGER DEFAULT 1,        -- 是否启用
    sort_order INTEGER DEFAULT 0,       -- 同类型内排序
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 索引
-- ============================================================
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
CREATE INDEX IF NOT EXISTS idx_daily_review_archive_news_date ON daily_review_archive_news(archive_date);
CREATE INDEX IF NOT EXISTS idx_tracked_symbols_type   ON tracked_symbols(symbol_type);
CREATE INDEX IF NOT EXISTS idx_tracked_symbols_active ON tracked_symbols(is_active);

-- ============================================================
-- 初始标的数据（大盘 / 指数 / 商品 / 汇率）
-- ============================================================
INSERT INTO tracked_symbols (symbol, yahoo_symbol, display_name, symbol_type, aliases, is_active, sort_order)
VALUES
  ('GSPC',     '^GSPC',      '标普500',          'index', '["S&P 500","SP500","标普500","标普","SPX"]', 1, 1),
  ('NDX',      '^NDX',       '纳斯达克100',      'index', '["Nasdaq 100","纳指","纳斯达克100","纳斯达克"]', 1, 2),
  ('STOXX50E', '^STOXX50E',  '欧洲斯托克50',     'index', '["STOXX50E","Euro Stoxx 50","欧洲斯托克50","欧股50"]', 1, 3),
  ('SSE',      '000001.SS',  '上证指数',         'index', '["SSE Composite","上证指数","沪指","上证","上证综合指数"]', 1, 4),
  ('KOSPI',    '^KS11',      '韩国综合股价指数', 'index', '["KOSPI","韩国综合股价指数","韩国综合指数","韩综指"]', 1, 5),
  ('HSTECH',   '3067.HK',    '恒生科技ETF',      'index', '["3067.HK","iShares Hang Seng TECH ETF","Hang Seng TECH","恒生科技指数","恒科指","恒生科技ETF"]', 1, 6),
  ('VIX',      '^VIX',       '恐慌指数',         'index', '["VIX","Volatility Index","恐慌指数","波动率指数"]', 1, 7),
  ('TNX',      '^TNX',       '十年期国债收益率', 'index', '["10年期美债收益率","TNX","国债收益率","国债"]', 1, 8),
  ('DXY',      'DX-Y.NYB',   '美元指数',         'index', '["DXY","Dollar Index","美元指数","美元"]', 1, 9),
  ('GOLD',     'GC=F',       '黄金',             'index', '["GC=F","Gold","黄金","金价","COMEX黄金","黄金现货/美元","现货黄金"]', 1, 10),
  ('SILVER',   'SI=F',       '白银',             'index', '["SI=F","Silver","白银","银价","COMEX白银","白银/美元","现货白银"]', 1, 11),
  ('COPPER',   'HG=F',       '铜期货',           'index', '["COPPER","HG=F","铜","铜期货","COMEX铜"]', 1, 12),
  ('SOYBEAN',  'ZS=F',       '大豆期货',         'index', '["SOYBEAN","ZS=F","大豆期货","大豆"]', 1, 13),
  ('BRENT',    'BZ=F',       'Brent原油',        'index', '["BRENT","BZ=F","Brent","布伦特原油","Brent原油"]', 1, 14),
  ('BTCUSD',   'BTC-USD',    '比特币/美元',      'index', '["BTCUSD","BTC-USD","比特币/美元","比特币","BTC"]', 1, 15),
  ('USDJPY',   'JPY=X',      '美元/日元',        'index', '["USDJPY","USD/JPY","美元/日元","美元兑日元"]', 1, 16),
  ('USDCNY',   'CNY=X',      '美元/人民币',      'index', '["USDCNY","USD/CNY","美元/人民币","美元兑人民币","离岸人民币"]', 1, 17)
ON CONFLICT(symbol) DO UPDATE SET
  yahoo_symbol = excluded.yahoo_symbol,
  display_name = excluded.display_name,
  symbol_type  = excluded.symbol_type,
  aliases      = excluded.aliases,
  is_active    = excluded.is_active,
  sort_order   = excluded.sort_order,
  updated_at   = CURRENT_TIMESTAMP;

-- 初始标的数据（板块 / ETF）
INSERT INTO tracked_symbols (symbol, yahoo_symbol, display_name, symbol_type, aliases, is_active, sort_order)
VALUES
  ('SOXX', 'SOXX', '半导体板块',    'sector', '["SOXX","iShares Semiconductor ETF","半导体","芯片板块","半导体ETF"]', 1, 1),
  ('XLK',  'XLK',  '科技板块',      'sector', '["XLK","Technology Select Sector SPDR ETF","科技板块","科技ETF"]', 1, 2),
  ('XLC',  'XLC',  '通信服务板块',  'sector', '["XLC","Communication Services Select Sector SPDR ETF","通信服务板块","通信服务ETF"]', 1, 3),
  ('XLI',  'XLI',  '工业板块',      'sector', '["XLI","Industrial Select Sector SPDR ETF","工业板块","工业ETF"]', 1, 4),
  ('XLP',  'XLP',  '必需消费板块',  'sector', '["XLP","Consumer Staples Select Sector SPDR ETF","必需消费","消费必需品ETF"]', 1, 5),
  ('XLY',  'XLY',  '可选消费板块',  'sector', '["XLY","Consumer Discretionary Select Sector SPDR ETF","可选消费","可选消费ETF"]', 1, 6),
  ('XLF',  'XLF',  '金融板块',      'sector', '["XLF","Financial Select Sector SPDR ETF","金融板块","金融ETF"]', 1, 7),
  ('XLE',  'XLE',  '能源板块',      'sector', '["XLE","Energy Select Sector SPDR ETF","能源板块","能源ETF"]', 1, 8),
  ('XLB',  'XLB',  '材料板块',      'sector', '["XLB","Materials Select Sector SPDR ETF","材料板块","材料ETF"]', 1, 9),
  ('XLU',  'XLU',  '公用事业板块',  'sector', '["XLU","Utilities Select Sector SPDR ETF","公用事业","公用事业ETF"]', 1, 10),
  ('XLV',  'XLV',  '医疗保健板块',  'sector', '["XLV","Health Care Select Sector SPDR ETF","医疗保健","医疗ETF"]', 1, 11),
  ('IYR',  'IYR',  '美国REIT板块',  'sector', '["IYR","iShares Select U.S. REIT ETF","美国REIT","REIT ETF"]', 1, 12),
  ('VIG',  'VIG',  '股息成长板块',  'sector', '["VIG","Vanguard Dividend Appreciation ETF","股息成长","红利成长ETF"]', 1, 13),
  ('AGG',  'AGG',  '美国综合债ETF', 'sector', '["AGG","iShares Core U.S. Aggregate Bond ETF","美国综合债","综合债ETF"]', 1, 14),
  ('EWY',  'EWY',  '韩国ETF',       'sector', '["EWY","iShares MSCI South Korea ETF","韩国ETF","韩国市场ETF"]', 1, 15)
ON CONFLICT(symbol) DO UPDATE SET
  yahoo_symbol = excluded.yahoo_symbol,
  display_name = excluded.display_name,
  symbol_type  = excluded.symbol_type,
  aliases      = excluded.aliases,
  is_active    = excluded.is_active,
  sort_order   = excluded.sort_order,
  updated_at   = CURRENT_TIMESTAMP;

-- 初始标的数据（个股）
INSERT INTO tracked_symbols (symbol, yahoo_symbol, display_name, symbol_type, aliases, is_active, sort_order)
VALUES
  ('MU',    'MU',    '美光科技', 'stock', '["MU","Micron","美光","美光科技","Micron Technology"]', 1, 1),
  ('SNDK',  'SNDK',  '闪迪',     'stock', '["SNDK","SanDisk","闪迪","SanDisk Corporation"]', 1, 2),
  ('LITE',  'LITE',  'Lumentum', 'stock', '["LITE","Lumentum","Lumentum Holdings","朗美通"]', 1, 3),
  ('AMD',   'AMD',   'AMD',      'stock', '["AMD","Advanced Micro Devices","超微半导体","超威半导体"]', 1, 4),
  ('GOOGL', 'GOOGL', '谷歌',     'stock', '["GOOGL","Google","Alphabet","谷歌","字母表"]', 1, 5),
  ('MSFT',  'MSFT',  '微软',     'stock', '["MSFT","Microsoft","微软","Microsoft Corporation"]', 1, 6)
ON CONFLICT(symbol) DO UPDATE SET
  yahoo_symbol = excluded.yahoo_symbol,
  display_name = excluded.display_name,
  symbol_type  = excluded.symbol_type,
  aliases      = excluded.aliases,
  is_active    = excluded.is_active,
  sort_order   = excluded.sort_order,
  updated_at   = CURRENT_TIMESTAMP;
