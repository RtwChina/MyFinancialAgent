-- Migration 011: 初筛关键词管理表
-- 存储全量初筛关键词，基础词通过 seed 写入，用户可通过前端增删

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

-- ============================================================
-- Seed: BASE_MACRO_KEYWORDS (中文)
-- ============================================================
INSERT OR IGNORE INTO screening_keywords (keyword, keyword_type, language, sort_order) VALUES
('美联储', 'macro', 'zh', 0),
('利率', 'macro', 'zh', 0),
('降息', 'macro', 'zh', 0),
('加息', 'macro', 'zh', 0),
('通胀', 'macro', 'zh', 0),
('非农', 'macro', 'zh', 0),
('就业', 'macro', 'zh', 0),
('关税', 'macro', 'zh', 0),
('制裁', 'macro', 'zh', 0),
('贸易', 'macro', 'zh', 0),
('财政刺激', 'macro', 'zh', 0),
('流动性', 'macro', 'zh', 0),
('衰退', 'macro', 'zh', 0),
('债务上限', 'macro', 'zh', 0),
('战争', 'macro', 'zh', 0),
('冲突', 'macro', 'zh', 0),
('霍尔木兹', 'macro', 'zh', 0),
('中东', 'macro', 'zh', 0),
('俄乌', 'macro', 'zh', 0),
('伊朗', 'macro', 'zh', 0),
('以色列', 'macro', 'zh', 0),
('原油', 'macro', 'zh', 0),
('油价', 'macro', 'zh', 0),
('地缘', 'macro', 'zh', 0),
('地缘政治', 'macro', 'zh', 0),
('央行', 'macro', 'zh', 0),
('货币政策', 'macro', 'zh', 0),
('国债', 'macro', 'zh', 0),
('美债', 'macro', 'zh', 0),
('收益率', 'macro', 'zh', 0);

-- ============================================================
-- Seed: BASE_MACRO_KEYWORDS (英文)
-- ============================================================
INSERT OR IGNORE INTO screening_keywords (keyword, keyword_type, language, sort_order) VALUES
('fed', 'macro', 'en', 0),
('federal reserve', 'macro', 'en', 0),
('interest rate', 'macro', 'en', 0),
('rate cut', 'macro', 'en', 0),
('rate hike', 'macro', 'en', 0),
('inflation', 'macro', 'en', 0),
('cpi', 'macro', 'en', 0),
('ppi', 'macro', 'en', 0),
('nonfarm', 'macro', 'en', 0),
('employment', 'macro', 'en', 0),
('unemployment', 'macro', 'en', 0),
('tariff', 'macro', 'en', 0),
('sanctions', 'macro', 'en', 0),
('trade war', 'macro', 'en', 0),
('fiscal', 'macro', 'en', 0),
('liquidity', 'macro', 'en', 0),
('recession', 'macro', 'en', 0),
('debt ceiling', 'macro', 'en', 0),
('war', 'macro', 'en', 0),
('conflict', 'macro', 'en', 0),
('middle east', 'macro', 'en', 0),
('iran', 'macro', 'en', 0),
('israel', 'macro', 'en', 0),
('crude oil', 'macro', 'en', 0),
('oil price', 'macro', 'en', 0),
('geopolitical', 'macro', 'en', 0),
('treasury', 'macro', 'en', 0),
('yield', 'macro', 'en', 0),
('monetary policy', 'macro', 'en', 0),
('central bank', 'macro', 'en', 0);

-- ============================================================
-- Seed: BASE_MARKET_KEYWORDS (中文)
-- ============================================================
INSERT OR IGNORE INTO screening_keywords (keyword, keyword_type, language, sort_order) VALUES
('标普', 'market', 'zh', 0),
('纳指', 'market', 'zh', 0),
('道指', 'market', 'zh', 0),
('财报', 'market', 'zh', 0),
('盈利', 'market', 'zh', 0),
('业绩', 'market', 'zh', 0),
('回购', 'market', 'zh', 0),
('分红', 'market', 'zh', 0),
('并购', 'market', 'zh', 0),
('收购', 'market', 'zh', 0),
('监管', 'market', 'zh', 0),
('芯片', 'market', 'zh', 0),
('半导体', 'market', 'zh', 0),
('人工智能', 'market', 'zh', 0),
('英伟达', 'market', 'zh', 0),
('微软', 'market', 'zh', 0),
('谷歌', 'market', 'zh', 0),
('数据中心', 'market', 'zh', 0),
('云计算', 'market', 'zh', 0),
('光模块', 'market', 'zh', 0),
('算力', 'market', 'zh', 0),
('存储', 'market', 'zh', 0),
('HBM', 'market', 'zh', 0);

-- ============================================================
-- Seed: BASE_MARKET_KEYWORDS (英文)
-- ============================================================
INSERT OR IGNORE INTO screening_keywords (keyword, keyword_type, language, sort_order) VALUES
('s&p', 'market', 'en', 0),
('nasdaq', 'market', 'en', 0),
('dow', 'market', 'en', 0),
('earnings', 'market', 'en', 0),
('revenue', 'market', 'en', 0),
('buyback', 'market', 'en', 0),
('dividend', 'market', 'en', 0),
('ipo', 'market', 'en', 0),
('merger', 'market', 'en', 0),
('acquisition', 'market', 'en', 0),
('regulation', 'market', 'en', 0),
('chip', 'market', 'en', 0),
('semiconductor', 'market', 'en', 0),
('ai', 'market', 'en', 0),
('artificial intelligence', 'market', 'en', 0),
('nvidia', 'market', 'en', 0),
('microsoft', 'market', 'en', 0),
('google', 'market', 'en', 0),
('apple', 'market', 'en', 0),
('data center', 'market', 'en', 0),
('cloud', 'market', 'en', 0),
('hbm', 'market', 'en', 0),
('memory', 'market', 'en', 0),
('optical', 'market', 'en', 0),
('capex', 'market', 'en', 0);

-- ============================================================
-- Seed: BASE_NOISE_KEYWORDS (中文)
-- ============================================================
INSERT OR IGNORE INTO screening_keywords (keyword, keyword_type, language, sort_order) VALUES
('分析师', 'noise', 'zh', 0),
('评级', 'noise', 'zh', 0),
('目标价', 'noise', 'zh', 0),
('看涨', 'noise', 'zh', 0),
('看跌', 'noise', 'zh', 0),
('买入评级', 'noise', 'zh', 0),
('卖出评级', 'noise', 'zh', 0),
('技术面', 'noise', 'zh', 0),
('盘前异动', 'noise', 'zh', 0),
('盘后异动', 'noise', 'zh', 0),
('短线', 'noise', 'zh', 0),
('传闻', 'noise', 'zh', 0);

-- ============================================================
-- Seed: BASE_NOISE_KEYWORDS (英文)
-- ============================================================
INSERT OR IGNORE INTO screening_keywords (keyword, keyword_type, language, sort_order) VALUES
('analyst', 'noise', 'en', 0),
('rating', 'noise', 'en', 0),
('price target', 'noise', 'en', 0),
('bullish', 'noise', 'en', 0),
('bearish', 'noise', 'en', 0),
('buy rating', 'noise', 'en', 0),
('sell rating', 'noise', 'en', 0),
('technical analysis', 'noise', 'en', 0),
('premarket', 'noise', 'en', 0),
('afterhours', 'noise', 'en', 0),
('rumor', 'noise', 'en', 0);

-- ============================================================
-- Seed: BASE_SYMBOL_CONTEXT_KEYWORDS (中文)
-- ============================================================
INSERT OR IGNORE INTO screening_keywords (keyword, keyword_type, language, sort_order) VALUES
('财报', 'symbol_context', 'zh', 0),
('指引', 'symbol_context', 'zh', 0),
('监管', 'symbol_context', 'zh', 0),
('诉讼', 'symbol_context', 'zh', 0),
('产品', 'symbol_context', 'zh', 0),
('合作', 'symbol_context', 'zh', 0),
('订单', 'symbol_context', 'zh', 0),
('收购', 'symbol_context', 'zh', 0),
('回购', 'symbol_context', 'zh', 0),
('盈利', 'symbol_context', 'zh', 0);

-- ============================================================
-- Seed: BASE_SYMBOL_CONTEXT_KEYWORDS (英文)
-- ============================================================
INSERT OR IGNORE INTO screening_keywords (keyword, keyword_type, language, sort_order) VALUES
('earnings', 'symbol_context', 'en', 0),
('guidance', 'symbol_context', 'en', 0),
('regulation', 'symbol_context', 'en', 0),
('lawsuit', 'symbol_context', 'en', 0),
('product', 'symbol_context', 'en', 0),
('partnership', 'symbol_context', 'en', 0),
('order', 'symbol_context', 'en', 0),
('acquisition', 'symbol_context', 'en', 0),
('buyback', 'symbol_context', 'en', 0),
('revenue', 'symbol_context', 'en', 0);
