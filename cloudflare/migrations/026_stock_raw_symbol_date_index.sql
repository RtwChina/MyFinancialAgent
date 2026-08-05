-- Latest-price lookups filter by symbol and an upper date bound.
-- Keep the existing single-column indexes until production observation confirms
-- which redundant indexes can be removed safely in a later migration.
CREATE INDEX IF NOT EXISTS idx_stock_raw_symbol_date
    ON stock_raw(symbol, k_date DESC);
