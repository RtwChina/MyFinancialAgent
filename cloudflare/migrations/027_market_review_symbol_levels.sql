-- 市场与板块合并：按复盘日+标的共用的支撑/压力，以及新的市场结构文档。
-- 仅 DDL：不回填历史、不删除旧笔记/计划价位列（它们作为只读归并证据保留）。
-- 新表不对 tracked_symbols 建外键，避免删除目录标的时连带删除历史价位。

CREATE TABLE IF NOT EXISTS daily_review_symbol_levels (
    archive_date TEXT NOT NULL,
    symbol TEXT NOT NULL,
    support_levels TEXT NOT NULL DEFAULT '',
    resistance_levels TEXT NOT NULL DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (archive_date, symbol)
);

ALTER TABLE daily_review_archive
  ADD COLUMN market_review_json TEXT;

ALTER TABLE daily_review_snapshots
  ADD COLUMN market_review_json TEXT;

ALTER TABLE daily_review_snapshots
  ADD COLUMN symbol_levels_json TEXT;
