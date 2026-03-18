# 周级集成测试模拟报告

- 生成时间：2026-03-17 00:59:38
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
- `PASS` validate-history-days: 2026-03-09[p=10,n=5], 2026-03-10[p=10,n=3], 2026-03-11[p=10,n=3], 2026-03-12[p=10,n=3], 2026-03-13[p=10,n=2]
- `PASS` run-hourly-news: Executed today's live hourly-news task
- `PASS` run-close-summary: Executed today's live close-summary task
- `PASS` final-integrity: {"counts": [{"results": [{"table_name": "stock_raw", "cnt": 59}, {"table_name": "news_raw_data", "cnt": 36}, {"table_name": "daily_news_ai_analysis", "cnt": 6}, {"table_name": "daily_review_archive", "cnt": 6}], "success": true, "meta": {"served_by": "v3-prod", "served_by_region": "APAC", "served_by_colo": "KIX", "served_by_primary": true, "timings": {"sql_duration_ms": 0.1995}, "duration": 0.1995, "changes": 0, "last_row_id": 6, "changed_db": false, "size_after": 151552, "rows_read": 107, "rows_written": 0, "total_attempts": 1}}, {"results": [{"duplicate_price_groups": 0}], "success": true, "meta": {"served_by": "v3-prod", "served_by_region": "APAC", "served_by_colo": "KIX", "served_by_primary": true, "timings": {"sql_duration_ms": 0.2214}, "duration": 0.2214, "changes": 0, "last_row_id": 6, "changed_db": false, "size_after": 151552, "rows_read": 59, "rows_written": 0, "total_attempts": 1}}, {"results": [{"duplicate_news_hash_groups": 0}], "success": true, "meta": {"served_by": "v3-prod", "served_by_region": "APAC", "served_by_colo": "KIX", "served_by_primary": true, "timings": {"sql_duration_ms": 0.0709}, "duration": 0.0709, "changes": 0, "last_row_id": 6, "changed_db": false, "size_after": 151552, "rows_read": 36, "rows_written": 0, "total_attempts": 1}}, {"results": [{"archive_date": "2026-03-16", "review_status": "initialized"}, {"archive_date": "2026-03-13", "review_status": "initialized"}, {"archive_date": "2026-03-12", "review_status": "initialized"}, {"archive_date": "2026-03-11", "review_status": "initialized"}, {"archive_date": "2026-03-10", "review_status": "initialized"}, {"archive_date": "2026-03-09", "review_status": "initialized"}], "success": true, "meta": {"served_by": "v3-prod", "served_by_region": "APAC", "served_by_colo": "KIX", "served_by_primary": true, "timings": {"sql_duration_ms": 0.0524}, "duration": 0.0524, "changes": 0, "last_row_id": 6, "changed_db": false, "size_after": 151552, "rows_read": 6, "rows_written": 0, "total_attempts": 1}}], "table_counts": {"stock_raw": 59, "news_raw_data": 36, "daily_news_ai_analysis": 6, "daily_review_archive": 6}, "reviews_total": 6, "live_date": "2026-03-16", "live_bootstrap_price_count": 9, "live_bootstrap_news_count": 6}

## 历史日期验证

- `2026-03-09`: prices=10, news=5, has_analysis=True
- `2026-03-10`: prices=10, news=3, has_analysis=True
- `2026-03-11`: prices=10, news=3, has_analysis=True
- `2026-03-12`: prices=10, news=3, has_analysis=True
- `2026-03-13`: prices=10, news=2, has_analysis=True

## 最终快照

- reviews_total=6
- live_bootstrap_price_count=9
- live_bootstrap_news_count=6

```json
[
  {
    "results": [
      {
        "table_name": "stock_raw",
        "cnt": 59
      },
      {
        "table_name": "news_raw_data",
        "cnt": 36
      },
      {
        "table_name": "daily_news_ai_analysis",
        "cnt": 6
      },
      {
        "table_name": "daily_review_archive",
        "cnt": 6
      }
    ],
    "success": true,
    "meta": {
      "served_by": "v3-prod",
      "served_by_region": "APAC",
      "served_by_colo": "KIX",
      "served_by_primary": true,
      "timings": {
        "sql_duration_ms": 0.1995
      },
      "duration": 0.1995,
      "changes": 0,
      "last_row_id": 6,
      "changed_db": false,
      "size_after": 151552,
      "rows_read": 107,
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
        "sql_duration_ms": 0.2214
      },
      "duration": 0.2214,
      "changes": 0,
      "last_row_id": 6,
      "changed_db": false,
      "size_after": 151552,
      "rows_read": 59,
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
        "sql_duration_ms": 0.0709
      },
      "duration": 0.0709,
      "changes": 0,
      "last_row_id": 6,
      "changed_db": false,
      "size_after": 151552,
      "rows_read": 36,
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
      },
      {
        "archive_date": "2026-03-10",
        "review_status": "initialized"
      },
      {
        "archive_date": "2026-03-09",
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
        "sql_duration_ms": 0.0524
      },
      "duration": 0.0524,
      "changes": 0,
      "last_row_id": 6,
      "changed_db": false,
      "size_after": 151552,
      "rows_read": 6,
      "rows_written": 0,
      "total_attempts": 1
    }
  }
]
```
