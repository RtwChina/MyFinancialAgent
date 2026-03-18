-- Migration 007: 标的管理表 + 新闻类型重命名
-- 1. 新增 tracked_symbols 表
-- 2. 写入初始标的数据（大盘 / 板块 / 个股）
-- 3. news_raw_data / daily_review_archive_news 类型值迁移：
--    macro → index, market → sector, symbol → stock

-- ============================================================
-- 1. tracked_symbols 表
-- ============================================================
CREATE TABLE IF NOT EXISTS tracked_symbols (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL UNIQUE,        -- 系统唯一标识，人类友好
    yahoo_symbol TEXT,                  -- Yahoo Finance 代码（为空则等同于 symbol）
    display_name TEXT NOT NULL,         -- 中文显示名
    symbol_type TEXT NOT NULL           -- 'index' / 'sector' / 'stock'
        CHECK(symbol_type IN ('index', 'sector', 'stock')),
    aliases TEXT DEFAULT '[]',          -- JSON 数组，新闻匹配别名
    is_active INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tracked_symbols_type   ON tracked_symbols(symbol_type);
CREATE INDEX IF NOT EXISTS idx_tracked_symbols_active ON tracked_symbols(is_active);

-- ============================================================
-- 2. 初始标的数据
-- ============================================================

-- 大盘 (index)
-- aliases 只存新闻里实际出现的写法，不包含 yahoo_symbol 技术代码
INSERT OR IGNORE INTO tracked_symbols (symbol, yahoo_symbol, display_name, symbol_type, aliases, sort_order) VALUES
('GSPC',  '^GSPC',     '标普500',    'index', '["S&P 500","SP500","标普500","标普","SPX"]', 1),
('NDX',   '^NDX',      '纳斯达克100','index', '["Nasdaq 100","纳指","纳斯达克100","纳斯达克"]', 2),
('DJI',   '^DJI',      '道琼斯',     'index', '["Dow Jones","DJIA","道指","道琼斯"]', 3),
('STOXX50E','^STOXX50E','欧洲斯托克50','index','["STOXX50E","Euro Stoxx 50","欧洲斯托克50","欧股50"]', 4),
('VIX',   '^VIX',      '恐慌指数',   'index', '["VIX","Volatility Index","恐慌指数","波动率指数"]', 4),
('HSI',   '^HSI',      '恒生指数',   'index', '["HSI","Hang Seng","恒指","恒生指数"]', 5),
('SSE',   '000001.SS', '上证指数',   'index', '["SSE Composite","上证指数","沪指","上证"]', 6),
('DXY',   'DX-Y.NYB',  '美元指数',   'index', '["DXY","Dollar Index","美元指数","美元"]', 7),
('GOLD',  'GC=F',      '黄金',       'index', '["GC=F","Gold","黄金","金价","COMEX黄金","黄金现货/美元","现货黄金"]', 8),
('CL',    'CL=F',      '原油',       'index', '["Crude Oil","WTI","原油","油价","WTI原油"]', 9),
('USDJPY','JPY=X',     '美元/日元',  'index', '["USDJPY","USD/JPY","美元/日元","美元兑日元"]', 10),
('USDCNY','CNY=X',     '美元/人民币','index', '["USDCNY","USD/CNY","美元/人民币","美元兑人民币","离岸人民币"]', 11),
('SILVER','SI=F',      '白银',       'index', '["SI=F","Silver","白银","银价","COMEX白银","白银/美元","现货白银"]', 12),
('COPPER','HG=F',      '铜期货',     'index', '["COPPER","HG=F","铜","铜期货","COMEX铜"]', 13),
('SOYBEAN','ZS=F',     '大豆期货',   'index', '["SOYBEAN","ZS=F","大豆期货","大豆"]', 14),
('BRENT', 'BZ=F',      'Brent原油',  'index', '["BRENT","BZ=F","Brent","布伦特原油","Brent原油"]', 15),
('BTCUSD','BTC-USD',   '比特币/美元','index', '["BTCUSD","BTC-USD","比特币/美元","比特币","BTC"]', 16),
('KOSPI', '^KS11',     '韩国综合股价指数','index','["KOSPI","韩国综合股价指数","韩国综合指数","韩综指"]', 17),
('HSTECH','3067.HK',   '恒生科技ETF','index','["3067.HK","iShares Hang Seng TECH ETF","Hang Seng TECH","恒生科技指数","恒科指","恒生科技ETF"]', 18),
('QQQ',   'QQQ',       '纳指100ETF', 'index', '["QQQ","Invesco QQQ","纳指ETF","纳斯达克100ETF"]', 19),
('SPY',   'SPY',       '标普500ETF', 'index', '["SPY","SPDR S&P 500 ETF","标普500ETF"]', 20);

-- 板块 (sector)
-- ticker 本身（XLK/SOXX 等）会出现在新闻里，保留
INSERT OR IGNORE INTO tracked_symbols (symbol, yahoo_symbol, display_name, symbol_type, aliases, sort_order) VALUES
('XLK',  'XLK',  '科技板块',   'sector', '["XLK","Technology","科技板块","科技ETF"]', 1),
('SOXX', 'SOXX', '半导体板块', 'sector', '["SOXX","iShares Semiconductor","半导体","芯片板块"]', 2),
('EWY',  'EWY',  '韩国ETF',    'sector', '["EWY","iShares MSCI South Korea ETF","韩国ETF","韩国市场ETF"]', 3),
('XLE',  'XLE',  '能源板块',   'sector', '["XLE","Energy","能源板块","能源ETF"]', 4),
('XLF',  'XLF',  '金融板块',   'sector', '["XLF","Financial","金融板块","金融ETF"]', 5),
('XLY',  'XLY',  '可选消费',   'sector', '["XLY","Consumer Discretionary","可选消费","消费板块"]', 6),
('XLC',  'XLC',  '通信服务板块','sector','["XLC","Communication Services Select Sector SPDR ETF","通信服务板块","通信服务ETF"]', 7),
('XLI',  'XLI',  '工业板块',   'sector', '["XLI","Industrial Select Sector SPDR ETF","工业板块","工业ETF"]', 8),
('XLP',  'XLP',  '必需消费板块','sector','["XLP","Consumer Staples Select Sector SPDR ETF","必需消费","消费必需品ETF"]', 9),
('XLB',  'XLB',  '材料板块',   'sector', '["XLB","Materials Select Sector SPDR ETF","材料板块","材料ETF"]', 10),
('XLU',  'XLU',  '公用事业板块','sector','["XLU","Utilities Select Sector SPDR ETF","公用事业","公用事业ETF"]', 11),
('XLV',  'XLV',  '医疗保健板块','sector','["XLV","Health Care Select Sector SPDR ETF","医疗保健","医疗ETF"]', 12),
('IYR',  'IYR',  '美国REIT板块','sector','["IYR","iShares U.S. Real Estate ETF","美国REIT","REIT ETF"]', 13),
('VIG',  'VIG',  '股息成长板块','sector','["VIG","Vanguard Dividend Appreciation ETF","股息成长","红利成长ETF"]', 14),
('AGG',  'AGG',  '美国综合债ETF','sector','["AGG","iShares Core U.S. Aggregate Bond ETF","美国综合债","综合债ETF"]', 15);

-- 个股 (stock)
INSERT OR IGNORE INTO tracked_symbols (symbol, yahoo_symbol, display_name, symbol_type, aliases, sort_order) VALUES
('MU',    'MU',    '美光科技', 'stock', '["MU","Micron","Micron Technology","美光","美光科技"]', 1),
('LITE',  'LITE',  'Lumentum', 'stock', '["LITE","Lumentum","Lumentum Holdings"]', 2),
('MSFT',  'MSFT',  '微软',     'stock', '["MSFT","Microsoft","微软","Microsoft Corporation"]', 3),
('GOOGL', 'GOOGL', '谷歌',     'stock', '["GOOGL","Google","Alphabet","谷歌","Alphabet Inc"]', 4);

-- ============================================================
-- 3. 新闻类型值迁移
-- ============================================================
UPDATE news_raw_data SET type = 'index'  WHERE type = 'macro';
UPDATE news_raw_data SET type = 'sector' WHERE type = 'market';
UPDATE news_raw_data SET type = 'stock'  WHERE type = 'symbol';

UPDATE daily_review_archive_news SET type = 'index'  WHERE type = 'macro';
UPDATE daily_review_archive_news SET type = 'sector' WHERE type = 'market';
UPDATE daily_review_archive_news SET type = 'stock'  WHERE type = 'symbol';
