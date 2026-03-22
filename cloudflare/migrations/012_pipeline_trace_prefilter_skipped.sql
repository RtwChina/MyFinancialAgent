-- 012: pipeline_trace 新增 prefilter_skipped 字段
-- 记录被 hash 预过滤跳过的新闻条数（已存在于数据库、无需重复处理）
ALTER TABLE pipeline_trace ADD COLUMN prefilter_skipped INTEGER NOT NULL DEFAULT 0;
