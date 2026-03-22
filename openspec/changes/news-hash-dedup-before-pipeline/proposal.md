## Why

每次运行新闻采集（每 2 小时一次），大量已入库的新闻会重走 Stage 1 → Stage 2 → Stage 3 的完整 pipeline，只在最后 `upsert` 时被忽略。这造成 Embedding API 和 LLM 资源的无效消耗，Stage 3 LLM 调用量中估计 60-80% 是重复处理。

## What Changes

- **Pipeline 入口前置 hash 过滤**：在 Stage 1 之前，从远端（或本地 DB）查询当前分析日已存在的 `news_hash` 集合，过滤掉已处理的新闻，只让新增的进入三级漏斗
- **filter_log 补充已跳过记录**：被 hash 过滤掉的新闻不进入 filter_log（不属于本次 pipeline 处理范围）

## Capabilities

### New Capabilities
- `news-pipeline-hash-prefilter`: Pipeline 入口处通过已入库 hash 集合跳过重复新闻，减少 Embedding 和 LLM 无效调用

### Modified Capabilities
（无 spec 级别的需求变更）

## Impact

- `src/collect_news_v3.py`：`collect_all_news()` 在 Stage 1 前增加 hash 预过滤步骤
- `src/cloudflare_ingest.py`：新增 `fetch_existing_hashes(date)` 方法，从远端 `/api/news?date=xxx` 或专用接口拉取已存在 hash 列表
- `cloudflare/worker/src/index.js`：可能需要新增或复用一个返回指定日期 hash 列表的轻量接口
- 本地环境（`is_local_env`）：从本地 SQLite 查询已存在 hash，逻辑与远端保持对称
