## Context

两个定时任务：
- `hourly-news`：采集新闻 → Stage 1 关键词 → Stage 2 Embedding → Stage 3 LLM → 写入 D1 → 初始化复盘记录
- `close-summary`：采集价格 → 写入 D1

本地测试用 `INGEST_API_BASE_URL=http://localhost:8788`，wrangler dev 作为 Worker，写入本地 D1。

## Goals / Non-Goals

**Goals:**
- 真实网络请求采集新闻和价格数据
- 新闻写入 D1 后前端可正常展示
- 采集结束后复盘记录被初始化（且已 reviewed 记录不被覆盖）
- pipeline trace 和 filter log 写入正常

**Non-Goals:**
- 不验证 LLM 分析内容质量（只验证流程不出错）
- 不覆盖所有数据源（只要有数据写入即可）

## Decisions

- `ENABLE_REMOTE_WRITE=true` + `INGEST_API_BASE_URL=http://localhost:8788` 写本地 Worker
- 先跑 hourly-news，再看数据，再跑 close-summary
- wrangler dev 必须保持运行

## Risks / Trade-offs

- 依赖真实外部 API（AkShare、Finnhub、DashScope），网络不稳定可能导致部分数据缺失，属正常
- LLM 调用有费用，测试用真实 token
