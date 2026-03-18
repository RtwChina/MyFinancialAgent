# 集成测试报告

- 生成时间：2026-03-18 09:50:24
- 测试 Worker：`https://my-financial-agent-test.rtw1994.workers.dev`
- 测试 D1：`my-financial-agent-test`
- 历史日期：2026-03-09, 2026-03-10, 2026-03-11, 2026-03-12, 2026-03-13
- 今日真实复盘日：`2026-03-17`
- 使用 seed：`/Users/didi/Project/MyFinancialAgent/tests/cases/fixtures/_generated_history_seed.sql`

## 执行步骤

- `PASS` health-check: {"ok": true, "service": "my-financial-agent-api", "env": "test"}
- `PASS` reset-test-db: Cleared remote business tables
- `PASS` build-generated-seed: /Users/didi/Project/MyFinancialAgent/tests/cases/fixtures/_generated_history_seed.sql
- `PASS` import-history-seed: Imported _generated_history_seed.sql into remote test D1
- `PASS` validate-history-baseline: [{"archive_date": "2026-03-09", "listed": true, "price_count": 10, "news_count": 19, "has_analysis": true}, {"archive_date": "2026-03-10", "listed": true, "price_count": 10, "news_count": 23, "has_analysis": true}, {"archive_date": "2026-03-11", "listed": true, "price_count": 10, "news_count": 20, "has_analysis": true}, {"archive_date": "2026-03-12", "listed": true, "price_count": 10, "news_count": 25, "has_analysis": true}, {"archive_date": "2026-03-13", "listed": true, "price_count": 10, "news_count": 15, "has_analysis": true}]
- `PASS` symbol-crud: {"initial_total": 19, "types": ["index", "sector", "stock"], "created_symbol": "IT1773798461"}
- `PASS` review-lifecycle: {"archive_date": "2026-03-13", "review_status": "reviewed", "archive_news_count": 15}
- `PASS` run-hourly-news: Executed today's live hourly-news task
- `PASS` run-close-summary: Executed today's live close-summary task
- `PASS` final-integrity: {"counts": [{"results": [{"table_name": "stock_raw", "cnt": 68}, {"table_name": "news_raw_data", "cnt": 118}, {"table_name": "daily_news_ai_analysis", "cnt": 5}, {"table_name": "daily_review_archive", "cnt": 6}, {"table_name": "daily_review_archive_news", "cnt": 15}], "success": true, "meta": {"served_by": "v3-prod", "served_by_region": "APAC", "served_by_colo": "KIX", "served_by_primary": true, "timings": {"sql_duration_ms": 0.3712}, "duration": 0.3712, "changes": 0, "last_row_id": 6, "changed_db": false, "size_after": 262144, "rows_read": 212, "rows_written": 0, "total_attempts": 1}}, {"results": [{"duplicate_price_groups": 0}], "success": true, "meta": {"served_by": "v3-prod", "served_by_region": "APAC", "served_by_colo": "KIX", "served_by_primary": true, "timings": {"sql_duration_ms": 0.1137}, "duration": 0.1137, "changes": 0, "last_row_id": 6, "changed_db": false, "size_after": 262144, "rows_read": 68, "rows_written": 0, "total_attempts": 1}}, {"results": [{"duplicate_news_hash_groups": 0}], "success": true, "meta": {"served_by": "v3-prod", "served_by_region": "APAC", "served_by_colo": "KIX", "served_by_primary": true, "timings": {"sql_duration_ms": 0.22}, "duration": 0.22, "changes": 0, "last_row_id": 6, "changed_db": false, "size_after": 262144, "rows_read": 118, "rows_written": 0, "total_attempts": 1}}, {"results": [{"duplicate_archive_news_groups": 0}], "success": true, "meta": {"served_by": "v3-prod", "served_by_region": "APAC", "served_by_colo": "KIX", "served_by_primary": true, "timings": {"sql_duration_ms": 0.1013}, "duration": 0.1013, "changes": 0, "last_row_id": 6, "changed_db": false, "size_after": 262144, "rows_read": 15, "rows_written": 0, "total_attempts": 1}}], "table_counts": {"stock_raw": 68, "news_raw_data": 118, "daily_news_ai_analysis": 5, "daily_review_archive": 6, "daily_review_archive_news": 15}, "duplicate_price_groups": 0, "duplicate_news_hash_groups": 0, "duplicate_archive_news_groups": 0, "reviews_total": 6, "live_date": "2026-03-17", "live_bootstrap_price_count": 16, "live_bootstrap_news_count": 12}

## 历史基线验证

- `2026-03-09`: listed=True, prices=10, news=19, has_analysis=True
- `2026-03-10`: listed=True, prices=10, news=23, has_analysis=True
- `2026-03-11`: listed=True, prices=10, news=20, has_analysis=True
- `2026-03-12`: listed=True, prices=10, news=25, has_analysis=True
- `2026-03-13`: listed=True, prices=10, news=15, has_analysis=True

## 最终完整性快照

- reviews_total=6
- live_bootstrap_price_count=16
- live_bootstrap_news_count=12
- duplicate_price_groups=0
- duplicate_news_hash_groups=0
- duplicate_archive_news_groups=0

```json
{
  "stock_raw": 68,
  "news_raw_data": 118,
  "daily_news_ai_analysis": 5,
  "daily_review_archive": 6,
  "daily_review_archive_news": 15
}
```
