-- tracked_symbols 扩展草案（基于 2026-03-18 截图识别）
-- 用途：
-- 1. 给用户确认大盘 / 指数 / 板块的推荐 symbol 与 yahoo_symbol
-- 2. 后续可拆分进正式 migration 或手工导入测试环境 / 生产环境
--
-- 说明：
-- - 统一使用系统 symbol 作为主键
-- - yahoo_symbol 作为行情提供方代码
-- - display_name 为前端中文显示名
-- - aliases 为新闻匹配与手工检索别名
-- 已额外查询确认：
--   - 黄金推荐使用 `GC=F`
--   - 白银推荐使用 `SI=F`
--   - 恒生科技指数在 Yahoo 上未直接验证成功，暂使用 `3067.HK`（iShares Hang Seng TECH ETF）做代理
-- - 这里使用 ON CONFLICT(symbol) DO UPDATE，便于在已有环境中补齐或更新

-- ============================================================
-- 大盘 / 指数 / 商品 / 汇率
-- ============================================================
INSERT INTO tracked_symbols (symbol, yahoo_symbol, display_name, symbol_type, aliases, is_active, sort_order)
VALUES
  ('DXY',      'DX-Y.NYB',   '美元指数',             'index', '["DXY","Dollar Index","美元指数","美元"]', 1, 7),
  ('USDJPY',   'JPY=X',      '美元/日元',            'index', '["USDJPY","USD/JPY","美元/日元","美元兑日元"]', 1, 10),
  ('USDCNY',   'CNY=X',      '美元/人民币',          'index', '["USDCNY","USD/CNY","美元/人民币","美元兑人民币","离岸人民币"]', 1, 11),
  ('GOLD',     'GC=F',       '黄金',                 'index', '["GC=F","Gold","黄金","金价","COMEX黄金","黄金现货/美元","现货黄金"]', 1, 12),
  ('SILVER',   'SI=F',       '白银',                 'index', '["SI=F","Silver","白银","银价","COMEX白银","白银/美元","现货白银"]', 1, 13),
  ('COPPER',   'HG=F',       '铜期货',               'index', '["COPPER","HG=F","铜","铜期货","COMEX铜"]', 1, 14),
  ('SOYBEAN',  'ZS=F',       '大豆期货',             'index', '["SOYBEAN","ZS=F","大豆期货","大豆"]', 1, 15),
  ('BRENT',    'BZ=F',       'Brent原油',            'index', '["BRENT","BZ=F","Brent","布伦特原油","Brent原油"]', 1, 16),
  ('BTCUSD',   'BTC-USD',    '比特币/美元',          'index', '["BTCUSD","BTC-USD","比特币/美元","比特币","BTC"]', 1, 17),
  ('GSPC',     '^GSPC',      '标普500',              'index', '["S&P 500","SP500","标普500","标普","SPX"]', 1, 1),
  ('NDX',      '^NDX',       '纳斯达克100',          'index', '["Nasdaq 100","纳指","纳斯达克100","纳斯达克"]', 1, 2),
  ('STOXX50E', '^STOXX50E',  '欧洲斯托克50',         'index', '["STOXX50E","Euro Stoxx 50","欧洲斯托克50","欧股50"]', 1, 3),
  ('SSE',      '000001.SS',  '上证指数',             'index', '["SSE Composite","上证指数","沪指","上证","上证综合指数"]', 1, 6),
  ('KOSPI',    '^KS11',      '韩国综合股价指数',     'index', '["KOSPI","韩国综合股价指数","韩国综合指数","韩综指"]', 1, 18),
  ('HSTECH',   '3067.HK',    '恒生科技ETF',          'index', '["3067.HK","iShares Hang Seng TECH ETF","Hang Seng TECH","恒生科技指数","恒科指","恒生科技ETF"]', 1, 19),
  ('VIX',      '^VIX',       '恐慌指数',             'index', '["VIX","Volatility Index","恐慌指数","波动率指数"]', 1, 4),
  ('QQQ',      'QQQ',        '纳指100ETF',           'index', '["QQQ","Invesco QQQ","纳指ETF","纳斯达克100ETF"]', 1, 20),
  ('SPY',      'SPY',        '标普500ETF',           'index', '["SPY","SPDR S&P 500 ETF","标普500ETF"]', 1, 21)
ON CONFLICT(symbol) DO UPDATE SET
  yahoo_symbol = excluded.yahoo_symbol,
  display_name = excluded.display_name,
  symbol_type = excluded.symbol_type,
  aliases = excluded.aliases,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  updated_at = CURRENT_TIMESTAMP;

-- ============================================================
-- 板块 / ETF
-- ============================================================
INSERT INTO tracked_symbols (symbol, yahoo_symbol, display_name, symbol_type, aliases, is_active, sort_order)
VALUES
  ('SOXX', 'SOXX', '半导体板块',   'sector', '["SOXX","iShares Semiconductor ETF","半导体","芯片板块","半导体ETF"]', 1, 2),
  ('EWY',  'EWY',  '韩国ETF',     'sector', '["EWY","iShares MSCI South Korea ETF","韩国ETF","韩国市场ETF"]', 1, 3),
  ('XLK',  'XLK',  '科技板块',     'sector', '["XLK","Technology Select Sector SPDR ETF","科技板块","科技ETF"]', 1, 1),
  ('XLC',  'XLC',  '通信服务板块', 'sector', '["XLC","Communication Services Select Sector SPDR ETF","通信服务板块","通信服务ETF"]', 1, 4),
  ('XLI',  'XLI',  '工业板块',     'sector', '["XLI","Industrial Select Sector SPDR ETF","工业板块","工业ETF"]', 1, 5),
  ('XLP',  'XLP',  '必需消费板块', 'sector', '["XLP","Consumer Staples Select Sector SPDR ETF","必需消费","消费必需品ETF"]', 1, 6),
  ('XLY',  'XLY',  '可选消费板块', 'sector', '["XLY","Consumer Discretionary Select Sector SPDR ETF","可选消费","可选消费ETF"]', 1, 7),
  ('XLF',  'XLF',  '金融板块',     'sector', '["XLF","Financial Select Sector SPDR ETF","金融板块","金融ETF"]', 1, 8),
  ('XLE',  'XLE',  '能源板块',     'sector', '["XLE","Energy Select Sector SPDR ETF","能源板块","能源ETF"]', 1, 9),
  ('XLB',  'XLB',  '材料板块',     'sector', '["XLB","Materials Select Sector SPDR ETF","材料板块","材料ETF"]', 1, 10),
  ('XLU',  'XLU',  '公用事业板块', 'sector', '["XLU","Utilities Select Sector SPDR ETF","公用事业","公用事业ETF"]', 1, 11),
  ('XLV',  'XLV',  '医疗保健板块', 'sector', '["XLV","Health Care Select Sector SPDR ETF","医疗保健","医疗ETF"]', 1, 12),
  ('IYR',  'IYR',  '美国REIT板块', 'sector', '["IYR","iShares Select U.S. REIT ETF","美国REIT","REIT ETF"]', 1, 13),
  ('VIG',  'VIG',  '股息成长板块', 'sector', '["VIG","Vanguard Dividend Appreciation ETF","股息成长","红利成长ETF"]', 1, 14),
  ('AGG',  'AGG',  '美国综合债ETF','sector', '["AGG","iShares Core U.S. Aggregate Bond ETF","美国综合债","综合债ETF"]', 1, 15)
ON CONFLICT(symbol) DO UPDATE SET
  yahoo_symbol = excluded.yahoo_symbol,
  display_name = excluded.display_name,
  symbol_type = excluded.symbol_type,
  aliases = excluded.aliases,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  updated_at = CURRENT_TIMESTAMP;

-- ============================================================
-- 备注
-- ============================================================
-- 1. 上证综合指数统一建议使用：
--    - 系统 symbol: SSE
--    - yahoo_symbol: 000001.SS
--    - display_name: 上证指数
-- 2. 恒生科技指数当前使用 `3067.HK` 作为 ETF 代理，不是 Yahoo 原生指数 code。
-- 3. 若后续需要区分“大宗商品”和“指数”，可在现有 symbol_type 之外新增 asset_class，
--    当前先继续沿用 symbol_type=index（大盘分析）承载。
