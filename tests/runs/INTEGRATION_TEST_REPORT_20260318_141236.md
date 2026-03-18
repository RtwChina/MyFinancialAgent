# 集成测试报告

- 生成时间：2026-03-18 14:12:36
- 测试 Worker：`https://my-financial-agent-test.rtw1994.workers.dev`
- 测试 D1：`my-financial-agent-test`
- 历史日期：2026-03-09, 2026-03-10, 2026-03-11, 2026-03-12, 2026-03-13
- 今日真实复盘日：`2026-03-18`
- 使用 seed：`/Users/didi/Project/MyFinancialAgent/tests/testdata/_generated_history_seed.sql`

## 执行步骤

- `PASS` health-check: {"ok": true, "service": "my-financial-agent-api", "env": "test"}
- `PASS` reset-test-db: Cleared remote business tables
- `PASS` build-generated-seed: /Users/didi/Project/MyFinancialAgent/tests/testdata/_generated_history_seed.sql
- `PASS` import-history-seed: Imported _generated_history_seed.sql into remote test D1
- `PASS` validate-history-baseline: [{"archive_date": "2026-03-09", "listed": true, "price_count": 17, "news_count": 19, "has_analysis": true}, {"archive_date": "2026-03-10", "listed": true, "price_count": 17, "news_count": 23, "has_analysis": true}, {"archive_date": "2026-03-11", "listed": true, "price_count": 17, "news_count": 20, "has_analysis": true}, {"archive_date": "2026-03-12", "listed": true, "price_count": 17, "news_count": 25, "has_analysis": true}, {"archive_date": "2026-03-13", "listed": true, "price_count": 17, "news_count": 15, "has_analysis": true}]
- `PASS` symbol-crud: {"initial_total": 40, "types": ["index", "sector", "stock"], "created_symbol": "IT1773814168"}
- `PASS` review-lifecycle: {"archive_date": "2026-03-13", "review_status": "reviewed", "archive_news_count": 15}
- `PASS` run-hourly-news: Executed today's live hourly-news task
- `PASS` run-close-summary: Executed today's live close-summary task
- `PASS` final-integrity: {"counts": [{"results": [{"table_name": "stock_raw", "cnt": 124}, {"table_name": "news_raw_data", "cnt": 118}, {"table_name": "daily_news_ai_analysis", "cnt": 6}, {"table_name": "daily_review_archive", "cnt": 6}, {"table_name": "daily_review_archive_news", "cnt": 15}], "success": true, "meta": {"served_by": "v3-prod", "served_by_region": "APAC", "served_by_colo": "KIX", "served_by_primary": true, "timings": {"sql_duration_ms": 0.3106}, "duration": 0.3106, "changes": 0, "last_row_id": 6, "changed_db": false, "size_after": 278528, "rows_read": 269, "rows_written": 0, "total_attempts": 1}}, {"results": [{"duplicate_price_groups": 0}], "success": true, "meta": {"served_by": "v3-prod", "served_by_region": "APAC", "served_by_colo": "KIX", "served_by_primary": true, "timings": {"sql_duration_ms": 0.1681}, "duration": 0.1681, "changes": 0, "last_row_id": 6, "changed_db": false, "size_after": 278528, "rows_read": 124, "rows_written": 0, "total_attempts": 1}}, {"results": [{"duplicate_news_hash_groups": 0}], "success": true, "meta": {"served_by": "v3-prod", "served_by_region": "APAC", "served_by_colo": "KIX", "served_by_primary": true, "timings": {"sql_duration_ms": 0.105}, "duration": 0.105, "changes": 0, "last_row_id": 6, "changed_db": false, "size_after": 278528, "rows_read": 118, "rows_written": 0, "total_attempts": 1}}, {"results": [{"duplicate_archive_news_groups": 0}], "success": true, "meta": {"served_by": "v3-prod", "served_by_region": "APAC", "served_by_colo": "KIX", "served_by_primary": true, "timings": {"sql_duration_ms": 0.0634}, "duration": 0.0634, "changes": 0, "last_row_id": 6, "changed_db": false, "size_after": 278528, "rows_read": 15, "rows_written": 0, "total_attempts": 1}}], "table_counts": {"stock_raw": 124, "news_raw_data": 118, "daily_news_ai_analysis": 6, "daily_review_archive": 6, "daily_review_archive_news": 15}, "duplicate_price_groups": 0, "duplicate_news_hash_groups": 0, "duplicate_archive_news_groups": 0, "reviews_total": 6, "live_date": "2026-03-18", "live_bootstrap_price_count": 13, "live_bootstrap_news_count": 5}

## 历史基线验证

- `2026-03-09`: listed=True, prices=17, news=19, has_analysis=True
- `2026-03-10`: listed=True, prices=17, news=23, has_analysis=True
- `2026-03-11`: listed=True, prices=17, news=20, has_analysis=True
- `2026-03-12`: listed=True, prices=17, news=25, has_analysis=True
- `2026-03-13`: listed=True, prices=17, news=15, has_analysis=True

## 最终完整性快照

- reviews_total=6
- live_bootstrap_price_count=13
- live_bootstrap_news_count=5
- duplicate_price_groups=0
- duplicate_news_hash_groups=0
- duplicate_archive_news_groups=0

```json
{
  "stock_raw": 124,
  "news_raw_data": 118,
  "daily_news_ai_analysis": 6,
  "daily_review_archive": 6,
  "daily_review_archive_news": 15
}
```
