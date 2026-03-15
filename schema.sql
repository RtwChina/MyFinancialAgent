-- 股票数据自动化复盘系统数据库结构
-- 适用于 Cloudflare D1 (SQLite 兼容)
-- 版本: v2.2

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
CREATE TABLE IF NOT EXISTS stock_news_raw (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pub_date DATETIME,                 -- 新闻发布时间 (重要: 复盘时按此时间筛选)
    title TEXT,                        -- 标题
    summary TEXT,                      -- 概述
    content TEXT,                      -- 正文
    url TEXT,                          -- 链接
    source TEXT,                       -- 来源: sina/cls_cn/jin10/yahoo_finance
    type TEXT,                         -- 类型: 0=重大新闻, 1=标的相关新闻
    ai_summary TEXT,                   -- AI总结 (LLM对单条新闻的总结)
    news_hash TEXT,                    -- 唯一标识 (用于去重)
    captured_at DATETIME,              -- 数据保存时间 (脚本采集时间)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,  -- 记录创建时间
    UNIQUE(news_hash)                  -- 防止重复新闻
);

-- ============================================================
-- 表 C：复盘存档表
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_archive (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    archive_date TEXT NOT NULL,        -- 复盘日期
    hist_price_level TEXT,             -- 历史价位复盘
    news_summary TEXT,                 -- 新闻总结
    market_sentiment TEXT,             -- 大盘流动性追踪
    sector_rotation TEXT,              -- 大宗商品与板块轮动
    asset_plan TEXT,                   -- 个股与资产操作计划
    trading_summary TEXT,              -- 深度思考与交易总结
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 表 D：新闻分析结果表 (LLM 筛选的重大新闻)
-- ============================================================
CREATE TABLE IF NOT EXISTS news_analysis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    analysis_date TEXT NOT NULL,       -- 分析日期 (YYYY-MM-DD)
    global_news TEXT,                  -- 全球重大新闻 (LLM筛选)
    market_news TEXT,                  -- 股票市场重大新闻 (LLM筛选)
    market_analysis TEXT,              -- 市场分析摘要
    raw_summary TEXT,                  -- LLM原始输出
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 索引
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_stock_raw_date ON stock_raw(k_date);
CREATE INDEX IF NOT EXISTS idx_stock_raw_symbol ON stock_raw(symbol);
CREATE INDEX IF NOT EXISTS idx_stock_news_pub_date ON stock_news_raw(pub_date);
CREATE INDEX IF NOT EXISTS idx_stock_news_source ON stock_news_raw(source);
CREATE INDEX IF NOT EXISTS idx_stock_news_type ON stock_news_raw(type);
CREATE INDEX IF NOT EXISTS idx_stock_archive_date ON stock_archive(archive_date);
CREATE INDEX IF NOT EXISTS idx_news_analysis_date ON news_analysis(analysis_date);