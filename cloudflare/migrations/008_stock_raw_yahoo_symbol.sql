-- Migration 008: stock_raw 表新增 yahoo_symbol 字段
-- 语义：symbol 为系统标识，yahoo_symbol 为 Yahoo Finance 代码

ALTER TABLE stock_raw ADD COLUMN yahoo_symbol TEXT;

-- 创建索引便于查询
CREATE INDEX IF NOT EXISTS idx_stock_raw_yahoo_symbol ON stock_raw(yahoo_symbol);