# 周级集成测试模拟报告

- 生成时间：2026-03-17 11:37:15
- 测试 Worker：`https://my-financial-agent-test.rtw1994.workers.dev`
- 测试 D1：`my-financial-agent-test`
- 历史日期：2026-03-09, 2026-03-10, 2026-03-11, 2026-03-12, 2026-03-13
- 今日真实复盘日：`2026-03-16`

## 执行步骤

- `PASS` health-check: {"ok": true, "service": "my-financial-agent-api", "env": "test"}
- `PASS` reset-test-db: Cleared stock_raw/news_raw_data/daily_news_ai_analysis/daily_review_archive
- `PASS` build-replay-fixtures: Built replay fixtures under /Users/didi/Project/MyFinancialAgent/tests/cases/fixtures/replay
- `FAIL` fatal-error: historical hourly-news task for 2026-03-09 failed with exit code 1
STDOUT:

[Hourly] 正在执行小时新闻任务...

正在采集新闻...
  ✓ merged-sources: 19 条

规则初筛保留 6 / 19 条新闻...

============================================================
采集任务完成!
============================================================
成功: 0/2 项任务

部分任务失败，请检查日志获取详细信息。

STDERR:
2026-03-17 11:35:24 - main - INFO - ============================================================
2026-03-17 11:35:24 - main - INFO - 股票数据自动化复盘系统 - 数据采集
2026-03-17 11:35:24 - main - INFO - 启动时间: 2026-03-09 15:00:00
2026-03-17 11:35:24 - main - INFO - 运行模式: hourly-news
2026-03-17 11:35:24 - main - INFO - ============================================================
2026-03-17 11:35:24 - main - INFO - 开始执行新闻采集...
2026-03-17 11:35:25 - collect_news_v3 - INFO - ============================================================
2026-03-17 11:35:25 - collect_news_v3 - INFO - 开始采集新闻 (v5.0 - 动态规则初筛 + 状态机 + 批量 LLM)
2026-03-17 11:35:25 - collect_news_v3 - INFO - 配置: rules_model=qwen3.5-plus, batch_model=qwen3.5-flash, summary_model=qwen3.5-plus, LLM_TIMEOUT=120s, LLM_MAX_RETRIES=2, LLM_MAX_WORKERS=2, LLM_BATCH_SIZE=6, LLM_CANDIDATE_LIMIT=6, SKIP_LLM=False
2026-03-17 11:35:25 - collect_news_v3 - INFO - 阶段超时: rules_timeout=120s, batch_timeout=120s, summary_timeout=240s
2026-03-17 11:35:25 - collect_news_v3 - INFO - ============================================================
2026-03-17 11:35:25 - collect_news_v3 - INFO - 当前新闻分析目标日: 2026-03-09
2026-03-17 11:35:25 - collect_news_v3 - INFO - 合并去重后: 19 条
2026-03-17 11:35:25 - collect_news_v3 - INFO - 调用 LLM: 动态初筛规则 2026-03-09 (model=qwen3.5-plus, timeout=120s, retry=0/2, stream=False, prompt_chars=2279)
2026-03-17 11:36:28 - collect_news_v3 - INFO - 动态初筛规则已生成: 宏观=8, 市场=8, 噪音=8, 动态主题=5
2026-03-17 11:36:28 - collect_news_v3 - INFO - 动态初筛摘要: 样本显示 AI 基建链（MU/LITE）与大厂商业化（MSFT/GOOGL）为核心驱动，需高权重关注；宏观数据（零售销售）与地缘风险（中东/黄金）影响风险偏好与避险资产；VIX 回落表明情绪修复。规则需聚焦实质业绩指引与宏观冲击，排除无财务影响的技术细节。
2026-03-17 11:36:28 - collect_news_v3 - INFO - 规则初筛命中过多，按分数仅保留前 6 条进入 LLM / 正式新闻库
2026-03-17 11:36:28 - collect_news_v3 - INFO - 规则初筛后保留 6 / 19 条新闻
2026-03-17 11:36:28 - collect_news_v3 - INFO - 调用 LLM: 新闻批次分析 2026-03-09-batch-1 (model=qwen3.5-flash, timeout=120s, retry=0/2, stream=False, prompt_chars=2879)
2026-03-17 11:37:11 - collect_news_v3 - INFO - LLM 精选后保留 5 条新闻
2026-03-17 11:37:11 - cloudflare_ingest - WARNING - 调用 Workers API 失败，第 1/3 次重试: 500 Server Error: Internal Server Error for url: https://my-financial-agent-test.rtw1994.workers.dev/api/ingest/news
2026-03-17 11:37:12 - cloudflare_ingest - WARNING - 调用 Workers API 失败，第 2/3 次重试: 500 Server Error: Internal Server Error for url: https://my-financial-agent-test.rtw1994.workers.dev/api/ingest/news
2026-03-17 11:37:15 - cloudflare_ingest - WARNING - 调用 Workers API 失败，第 3/3 次重试: 500 Server Error: Internal Server Error for url: https://my-financial-agent-test.rtw1994.workers.dev/api/ingest/news
2026-03-17 11:37:15 - main - ERROR - 新闻采集失败: 调用 Workers API 失败: 500 Server Error: Internal Server Error for url: https://my-financial-agent-test.rtw1994.workers.dev/api/ingest/news
Traceback (most recent call last):
  File "/Users/didi/Project/MyFinancialAgent/cloudflare_ingest.py", line 61, in _post
    response.raise_for_status()
  File "/Users/didi/Project/MyFinancialAgent/.venv/lib/python3.11/site-packages/requests/models.py", line 1026, in raise_for_status
    raise HTTPError(http_error_msg, response=self)
requests.exceptions.HTTPError: 500 Server Error: Internal Server Error for url: https://my-financial-agent-test.rtw1994.workers.dev/api/ingest/news

The above exception was the direct cause of the following exception:

Traceback (most recent call last):
  File "/Users/didi/Project/MyFinancialAgent/main.py", line 53, in run_news_collector
    result = run_news_pipeline(
             ^^^^^^^^^^^^^^^^^^
  File "/Users/didi/Project/MyFinancialAgent/collect_news_v3.py", line 1339, in run_news_pipeline
    screened_result = send_news(screened_news) if screened_news else {"inserted": 0, "updated": 0, "ignored": 0}
                      ^^^^^^^^^^^^^^^^^^^^^^^^
  File "/Users/didi/Project/MyFinancialAgent/cloudflare_ingest.py", line 127, in send_news
    result = _send_in_batches("/api/ingest/news", news_items, NEWS_BATCH_SIZE)
             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/Users/didi/Project/MyFinancialAgent/cloudflare_ingest.py", line 101, in _send_in_batches
    result = _post(path, {"items": batch})
             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/Users/didi/Project/MyFinancialAgent/cloudflare_ingest.py", line 69, in _post
    raise CloudflareIngestError(f"调用 Workers API 失败: {last_error}") from last_error
cloudflare_ingest.CloudflareIngestError: 调用 Workers API 失败: 500 Server Error: Internal Server Error for url: https://my-financial-agent-test.rtw1994.workers.dev/api/ingest/news


## 历史日期验证


## 最终快照

- reviews_total=n/a
- live_bootstrap_price_count=n/a
- live_bootstrap_news_count=n/a

```json
{}
```
