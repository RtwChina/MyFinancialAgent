-- Migration 008: stock_raw.symbol 从 Yahoo 代码迁移到系统代码
-- 背景：tracked_symbols 表引入后，系统统一使用简洁的系统代码（如 GSPC），
--       但历史 stock_raw 数据仍存储 Yahoo 代码（如 ^GSPC）。
--       本次迁移将已知映射关系逐一更新，使价格数据能正确与标的表关联。

UPDATE stock_raw SET symbol = 'GSPC'  WHERE symbol = '^GSPC';
UPDATE stock_raw SET symbol = 'NDX'   WHERE symbol = '^NDX';
UPDATE stock_raw SET symbol = 'DJI'   WHERE symbol = '^DJI';
UPDATE stock_raw SET symbol = 'VIX'   WHERE symbol = '^VIX';
UPDATE stock_raw SET symbol = 'HSI'   WHERE symbol = '^HSI';
UPDATE stock_raw SET symbol = 'IXIC'  WHERE symbol = '^IXIC';
UPDATE stock_raw SET symbol = 'SSE'   WHERE symbol = '000001.SS';
UPDATE stock_raw SET symbol = 'DXY'   WHERE symbol = 'DX-Y.NYB';
UPDATE stock_raw SET symbol = 'GOLD'  WHERE symbol = 'GC=F';
UPDATE stock_raw SET symbol = 'CL'    WHERE symbol = 'CL=F';
