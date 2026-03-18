# Smoke Test Report

- Date: 2026-03-18
- Scope: tracked_symbols 默认值更新后的本地冒烟复跑

## SMK-001 CLI help
PASS

## SMK-002 replay price collection
symbol  current_price
   SSE      3378.9507
   DXY       103.9242
  GOLD      3017.2751
 GOOGL       191.6033
  LITE        59.9050
rows= 10

## SMK-003 replay news pipeline

正在采集新闻...
  ✓ merged-sources: 20 条

规则初筛保留 6 / 20 条新闻...
{'filepath': 'output/news_v3_20260313_150000.xlsx', 'news_count': 6, 'inserted_count': 0, 'summary': '### 今日大事概览\n- 美联储官员释放偏鹰信号，美元与长端利率同步走高 #20260313-08-01：宏观关键词命中 利率, 美联储, 通胀\n- 美联储官员释放偏鹰信号，美元与长端利率同步走高 #20260313-07-00：宏观关键词命中 利率, 美联储, 通胀\n- 美联储官员释放偏鹰信号，美元与长端利率同步走高 #20260313-02-00：宏观关键词命中 利率, 美联储, 通胀\n- 中东局势再起波澜，油价与黄金获得避险买盘 #20260313-06-01：宏观关键词命中 中东, 原油, 油价\n- 美国零售销售低于预期，市场重新交易增长放缓 #20260313-00-02：宏观关键词命中 利率；市场关键词命中 盈利\n\n### 大盘与板块影响图谱\n- [大盘] 美股大盘：中性。原因是宏观与市场事件交织，短线方向仍取决于后续定价。\n\n### 联动逻辑链\n- 美联储官员释放偏鹰信号，美元与长端利率同步走高 #20260313-08-01 -> 宏观关键词命中 利率, 美联储, 通胀\n- 美联储官员释放偏鹰信号，美元与长端利率同步走高 #20260313-07-00 -> 宏观关键词命中 利率, 美联储, 通胀\n- 美联储官员释放偏鹰信号，美元与长端利率同步走高 #20260313-02-00 -> 宏观关键词命中 利率, 美联储, 通胀', 'analysis_date': '2026-03-13', 'batch_count': 1, 'screened_count': 6, 'processed_count': 6, 'persisted_summary': False}

## SMK-004 schema check
daily_review_archive ['archive_date', 'review_status', 'reviewer_news_notes', 'market_sentiment', 'sector_rotation', 'asset_plan', 'trading_summary', 'reviewed_at', 'updated_at']
daily_news_ai_analysis ['analysis_date', 'daily_major_events', 'sector_impact_map', 'linkage_logic_chain', 'source_news_ids', 'updated_at']
daily_review_archive_news ['id', 'archive_date', 'original_news_id', 'pub_date', 'title', 'content', 'url', 'source', 'type', 'rule_passed', 'rule_reason', 'processing_status', 'ai_summary', 'market_impact', 'importance_stars', 'related_symbols', 'news_hash', 'archived_at']
tracked_symbols ['id', 'symbol', 'yahoo_symbol', 'display_name', 'symbol_type', 'aliases', 'is_active', 'sort_order', 'created_at', 'updated_at']

## SMK-005 local worker health
{
  "ok": true,
  "service": "my-financial-agent-api",
  "env": "test"
}
## SMK-006 news/review UI

Running 1 test using 1 worker





[1A[2K[1/1] tests/cases/smoke/news_and_deleted_ui.spec.js:6:1 › news search and initialized review entry stay usable on the current UI
[1A[2K  1 passed (4.9s)

## SMK-007 review drawer UI

Running 1 test using 1 worker





[1A[2K[1/1] tests/cases/smoke/review_ui_check.spec.js:6:1 › review workspace renders analysis, grouped prices, and reusable news detail modal
[1A[2K  1 passed (3.0s)

## SMK-008 symbol manager UI

Running 1 test using 1 worker





[1A[2K[1/1] tests/cases/smoke/symbol_manager_ui.spec.js:4:1 › symbol manager page can add and delete a temporary symbol
[1A[2K  1 passed (3.1s)

## SMK-009 reviewed edit cycle UI

Running 1 test using 1 worker





[1A[2K[1/1] tests/cases/smoke/review_edit_cycle.spec.js:6:1 › review can be completed, reopened, edited, and saved again
[1A[2K  1 passed (3.8s)

## Result
PASS
