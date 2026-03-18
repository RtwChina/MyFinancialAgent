# 周级集成测试模拟报告

- 生成时间：2026-03-17 11:57:02
- 测试 Worker：`https://my-financial-agent-test.rtw1994.workers.dev`
- 测试 D1：`my-financial-agent-test`
- 历史日期：2026-03-09, 2026-03-10, 2026-03-11, 2026-03-12, 2026-03-13
- 今日真实复盘日：`2026-03-16`

## 执行步骤

- `PASS` health-check: {"ok": true, "service": "my-financial-agent-api", "env": "test"}
- `PASS` reset-test-db: Cleared stock_raw/news_raw_data/daily_news_ai_analysis/daily_review_archive
- `PASS` build-replay-fixtures: Built replay fixtures under /Users/didi/Project/MyFinancialAgent/tests/cases/fixtures/replay
- `PASS` historical-hourly-news-2026-03-09: Historical replay hourly-news executed
- `PASS` historical-close-summary-2026-03-09: Historical replay close-summary executed
- `PASS` historical-hourly-news-2026-03-10: Historical replay hourly-news executed
- `PASS` historical-close-summary-2026-03-10: Historical replay close-summary executed
- `PASS` historical-hourly-news-2026-03-11: Historical replay hourly-news executed
- `PASS` historical-close-summary-2026-03-11: Historical replay close-summary executed
- `PASS` historical-hourly-news-2026-03-12: Historical replay hourly-news executed
- `PASS` historical-close-summary-2026-03-12: Historical replay close-summary executed
- `PASS` historical-hourly-news-2026-03-13: Historical replay hourly-news executed
- `PASS` historical-close-summary-2026-03-13: Historical replay close-summary executed
- `FAIL` validate-history-days: 2026-03-09[p=0,n=12], 2026-03-10[p=0,n=12], 2026-03-11[p=0,n=12], 2026-03-12[p=10,n=4], 2026-03-13[p=10,n=4]
- `PASS` run-hourly-news: Executed today's live hourly-news task
- `PASS` run-close-summary: Executed today's live close-summary task
- `PASS` final-integrity: {"counts": [{"results": [{"table_name": "stock_raw", "cnt": 29}, {"table_name": "news_raw_data", "cnt": 22}, {"table_name": "daily_news_ai_analysis", "cnt": 4}, {"table_name": "daily_review_archive", "cnt": 4}], "success": true, "meta": {"served_by": "v3-prod", "served_by_region": "APAC", "served_by_colo": "KIX", "served_by_primary": true, "timings": {"sql_duration_ms": 0.2273}, "duration": 0.2273, "changes": 0, "last_row_id": 8, "changed_db": false, "size_after": 155648, "rows_read": 59, "rows_written": 0, "total_attempts": 1}}, {"results": [{"duplicate_price_groups": 0}], "success": true, "meta": {"served_by": "v3-prod", "served_by_region": "APAC", "served_by_colo": "KIX", "served_by_primary": true, "timings": {"sql_duration_ms": 0.1053}, "duration": 0.1053, "changes": 0, "last_row_id": 8, "changed_db": false, "size_after": 155648, "rows_read": 29, "rows_written": 0, "total_attempts": 1}}, {"results": [{"duplicate_news_hash_groups": 0}], "success": true, "meta": {"served_by": "v3-prod", "served_by_region": "APAC", "served_by_colo": "KIX", "served_by_primary": true, "timings": {"sql_duration_ms": 0.0612}, "duration": 0.0612, "changes": 0, "last_row_id": 8, "changed_db": false, "size_after": 155648, "rows_read": 22, "rows_written": 0, "total_attempts": 1}}, {"results": [{"archive_date": "2026-03-16", "review_status": "initialized"}, {"archive_date": "2026-03-13", "review_status": "initialized"}, {"archive_date": "2026-03-12", "review_status": "initialized"}, {"archive_date": "2026-03-11", "review_status": "initialized"}], "success": true, "meta": {"served_by": "v3-prod", "served_by_region": "APAC", "served_by_colo": "KIX", "served_by_primary": true, "timings": {"sql_duration_ms": 0.045}, "duration": 0.045, "changes": 0, "last_row_id": 8, "changed_db": false, "size_after": 155648, "rows_read": 4, "rows_written": 0, "total_attempts": 1}}], "table_counts": {"stock_raw": 29, "news_raw_data": 22, "daily_news_ai_analysis": 4, "daily_review_archive": 4}, "reviews_total": 4, "live_date": "2026-03-16", "live_bootstrap_price_count": 7, "live_bootstrap_news_count": 4}

## 历史日期验证

- `2026-03-09`: prices=0, news=12, has_analysis=True
- `2026-03-10`: prices=0, news=12, has_analysis=True
- `2026-03-11`: prices=0, news=12, has_analysis=True
- `2026-03-12`: prices=10, news=4, has_analysis=True
- `2026-03-13`: prices=10, news=4, has_analysis=True

## 最终快照

- reviews_total=4
- live_bootstrap_price_count=7
- live_bootstrap_news_count=4

```json
[
  {
    "results": [
      {
        "table_name": "stock_raw",
        "cnt": 29
      },
      {
        "table_name": "news_raw_data",
        "cnt": 22
      },
      {
        "table_name": "daily_news_ai_analysis",
        "cnt": 4
      },
      {
        "table_name": "daily_review_archive",
        "cnt": 4
      }
    ],
    "success": true,
    "meta": {
      "served_by": "v3-prod",
      "served_by_region": "APAC",
      "served_by_colo": "KIX",
      "served_by_primary": true,
      "timings": {
        "sql_duration_ms": 0.2273
      },
      "duration": 0.2273,
      "changes": 0,
      "last_row_id": 8,
      "changed_db": false,
      "size_after": 155648,
      "rows_read": 59,
      "rows_written": 0,
      "total_attempts": 1
    }
  },
  {
    "results": [
      {
        "duplicate_price_groups": 0
      }
    ],
    "success": true,
    "meta": {
      "served_by": "v3-prod",
      "served_by_region": "APAC",
      "served_by_colo": "KIX",
      "served_by_primary": true,
      "timings": {
        "sql_duration_ms": 0.1053
      },
      "duration": 0.1053,
      "changes": 0,
      "last_row_id": 8,
      "changed_db": false,
      "size_after": 155648,
      "rows_read": 29,
      "rows_written": 0,
      "total_attempts": 1
    }
  },
  {
    "results": [
      {
        "duplicate_news_hash_groups": 0
      }
    ],
    "success": true,
    "meta": {
      "served_by": "v3-prod",
      "served_by_region": "APAC",
      "served_by_colo": "KIX",
      "served_by_primary": true,
      "timings": {
        "sql_duration_ms": 0.0612
      },
      "duration": 0.0612,
      "changes": 0,
      "last_row_id": 8,
      "changed_db": false,
      "size_after": 155648,
      "rows_read": 22,
      "rows_written": 0,
      "total_attempts": 1
    }
  },
  {
    "results": [
      {
        "archive_date": "2026-03-16",
        "review_status": "initialized"
      },
      {
        "archive_date": "2026-03-13",
        "review_status": "initialized"
      },
      {
        "archive_date": "2026-03-12",
        "review_status": "initialized"
      },
      {
        "archive_date": "2026-03-11",
        "review_status": "initialized"
      }
    ],
    "success": true,
    "meta": {
      "served_by": "v3-prod",
      "served_by_region": "APAC",
      "served_by_colo": "KIX",
      "served_by_primary": true,
      "timings": {
        "sql_duration_ms": 0.045
      },
      "duration": 0.045,
      "changes": 0,
      "last_row_id": 8,
      "changed_db": false,
      "size_after": 155648,
      "rows_read": 4,
      "rows_written": 0,
      "total_attempts": 1
    }
  }
]
```
