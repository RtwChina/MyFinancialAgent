# 周级集成测试模拟报告

- 生成时间：2026-03-16 22:44:06
- 测试 Worker：`https://my-financial-agent-test.rtw1994.workers.dev`
- 测试 D1：`my-financial-agent-test`
- 历史日期：2026-03-09, 2026-03-10, 2026-03-11, 2026-03-12, 2026-03-13
- 今日真实任务日期：`2026-03-16`

## 执行步骤

- `PASS` health-check: {"ok": true, "service": "my-financial-agent-api", "env": "test"}
- `PASS` reset-test-db: Cleared stock_raw/news_raw_data/daily_news_ai_analysis/daily_review_archive
- `PASS` replay-history-fixture: Imported _generated_history_seed.sql
- `PASS` validate-history-days: 2026-03-09[p=10,n=19], 2026-03-10[p=10,n=23], 2026-03-11[p=10,n=20], 2026-03-12[p=10,n=25], 2026-03-13[p=10,n=15]
- `PASS` run-hourly-news: Executed today's live hourly-news task
- `PASS` run-close-summary: Executed today's live close-summary task
- `PASS` final-integrity: {"counts": [{"results": [{"table_name": "stock_raw", "cnt": 60}, {"table_name": "news_raw_data", "cnt": 118}, {"table_name": "daily_news_ai_analysis", "cnt": 0}, {"table_name": "daily_review_archive", "cnt": 6}], "success": true, "meta": {"served_by": "v3-prod", "served_by_region": "APAC", "served_by_colo": "KIX", "served_by_primary": true, "timings": {"sql_duration_ms": 0.2068}, "duration": 0.2068, "changes": 0, "last_row_id": 6, "changed_db": false, "size_after": 192512, "rows_read": 185, "rows_written": 0, "total_attempts": 1}}, {"results": [{"duplicate_price_groups": 0}], "success": true, "meta": {"served_by": "v3-prod", "served_by_region": "APAC", "served_by_colo": "KIX", "served_by_primary": true, "timings": {"sql_duration_ms": 0.1138}, "duration": 0.1138, "changes": 0, "last_row_id": 6, "changed_db": false, "size_after": 192512, "rows_read": 60, "rows_written": 0, "total_attempts": 1}}, {"results": [{"duplicate_news_hash_groups": 0}], "success": true, "meta": {"served_by": "v3-prod", "served_by_region": "APAC", "served_by_colo": "KIX", "served_by_primary": true, "timings": {"sql_duration_ms": 0.117}, "duration": 0.117, "changes": 0, "last_row_id": 6, "changed_db": false, "size_after": 192512, "rows_read": 118, "rows_written": 0, "total_attempts": 1}}, {"results": [{"archive_date": "2026-03-16", "review_status": "initialized"}, {"archive_date": "2026-03-13", "review_status": "initialized"}, {"archive_date": "2026-03-12", "review_status": "initialized"}, {"archive_date": "2026-03-11", "review_status": "initialized"}, {"archive_date": "2026-03-10", "review_status": "initialized"}, {"archive_date": "2026-03-09", "review_status": "initialized"}], "success": true, "meta": {"served_by": "v3-prod", "served_by_region": "APAC", "served_by_colo": "KIX", "served_by_primary": true, "timings": {"sql_duration_ms": 0.0721}, "duration": 0.0721, "changes": 0, "last_row_id": 6, "changed_db": false, "size_after": 192512, "rows_read": 6, "rows_written": 0, "total_attempts": 1}}], "reviews_total": 6, "live_bootstrap_price_count": 10, "live_bootstrap_news_count": 12}

## 历史日期验证

- `2026-03-09`: prices=10, news=19, has_analysis=True
- `2026-03-10`: prices=10, news=23, has_analysis=True
- `2026-03-11`: prices=10, news=20, has_analysis=True
- `2026-03-12`: prices=10, news=25, has_analysis=True
- `2026-03-13`: prices=10, news=15, has_analysis=True

## 最终快照

- reviews_total=6
- live_bootstrap_price_count=10
- live_bootstrap_news_count=12

```json
[
  {
    "results": [
      {
        "table_name": "stock_raw",
        "cnt": 60
      },
      {
        "table_name": "news_raw_data",
        "cnt": 118
      },
      {
        "table_name": "daily_news_ai_analysis",
        "cnt": 0
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
        "sql_duration_ms": 0.2068
      },
      "duration": 0.2068,
      "changes": 0,
      "last_row_id": 6,
      "changed_db": false,
      "size_after": 192512,
      "rows_read": 185,
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
        "sql_duration_ms": 0.1138
      },
      "duration": 0.1138,
      "changes": 0,
      "last_row_id": 6,
      "changed_db": false,
      "size_after": 192512,
      "rows_read": 60,
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
        "sql_duration_ms": 0.117
      },
      "duration": 0.117,
      "changes": 0,
      "last_row_id": 6,
      "changed_db": false,
      "size_after": 192512,
      "rows_read": 118,
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
        "sql_duration_ms": 0.0721
      },
      "duration": 0.0721,
      "changes": 0,
      "last_row_id": 6,
      "changed_db": false,
      "size_after": 192512,
      "rows_read": 6,
      "rows_written": 0,
      "total_attempts": 1
    }
  }
]
```
