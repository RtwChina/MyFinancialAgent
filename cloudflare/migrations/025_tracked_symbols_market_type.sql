ALTER TABLE tracked_symbols ADD COLUMN market_type TEXT DEFAULT '美股';

UPDATE tracked_symbols
SET market_type = CASE
    WHEN yahoo_symbol LIKE '%.SS' OR yahoo_symbol LIKE '%.SZ' OR yahoo_symbol LIKE '%.HK'
      OR symbol LIKE '%.SS' OR symbol LIKE '%.SZ' OR symbol LIKE '%.HK'
      OR symbol GLOB '*[一-龥]*'
    THEN '大A'
    ELSE '美股'
  END
WHERE symbol_type = 'stock';

UPDATE tracked_symbols
SET market_type = '美股'
WHERE market_type IS NULL OR market_type NOT IN ('美股', '大A');
