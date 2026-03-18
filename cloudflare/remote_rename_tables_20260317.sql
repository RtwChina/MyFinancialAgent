-- 远端 D1 保留数据升级脚本。
-- 将历史表名升级为当前命名：
--   stock_news_raw      -> news_raw_data
--   stock_archive       -> daily_review_archive
--   news_analysis       -> daily_news_ai_analysis
-- 并同步重建索引名称。

ALTER TABLE stock_news_raw RENAME TO news_raw_data;
ALTER TABLE stock_archive RENAME TO daily_review_archive;
ALTER TABLE news_analysis RENAME TO daily_news_ai_analysis;

DROP INDEX IF EXISTS idx_stock_news_pub_date;
DROP INDEX IF EXISTS idx_stock_news_source;
DROP INDEX IF EXISTS idx_stock_news_type;
DROP INDEX IF EXISTS idx_stock_news_rule_passed;
DROP INDEX IF EXISTS idx_stock_news_status;
DROP INDEX IF EXISTS idx_stock_news_relevant;
DROP INDEX IF EXISTS idx_stock_archive_date;
DROP INDEX IF EXISTS idx_stock_archive_status_date;
DROP INDEX IF EXISTS idx_news_analysis_date;

CREATE INDEX IF NOT EXISTS idx_news_raw_data_pub_date ON news_raw_data(pub_date);
CREATE INDEX IF NOT EXISTS idx_news_raw_data_source ON news_raw_data(source);
CREATE INDEX IF NOT EXISTS idx_news_raw_data_type ON news_raw_data(type);
CREATE INDEX IF NOT EXISTS idx_news_raw_data_rule_passed ON news_raw_data(rule_passed);
CREATE INDEX IF NOT EXISTS idx_news_raw_data_status ON news_raw_data(processing_status);
CREATE INDEX IF NOT EXISTS idx_news_raw_data_relevant ON news_raw_data(is_relevant_to_review);
CREATE INDEX IF NOT EXISTS idx_daily_review_archive_date ON daily_review_archive(archive_date);
CREATE INDEX IF NOT EXISTS idx_daily_review_archive_status_date ON daily_review_archive(review_status, archive_date);
CREATE INDEX IF NOT EXISTS idx_daily_news_ai_analysis_date ON daily_news_ai_analysis(analysis_date);
