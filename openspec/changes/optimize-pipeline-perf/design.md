## Context

新闻 pipeline 经过 Session 连接池 + Embedding 并发优化后，单次执行约 337s。Finnhub 公司新闻串行查询 19 个标的（含 0.5s 间隔）耗时 ~20s，可通过并发降到 ~5s。

## Goals / Non-Goals

**Goals:**
- Finnhub 公司新闻查询从串行 ~20s 降到 ~5s

**Non-Goals:**
- 不引入 asyncio（Finnhub SDK 是同步的，ThreadPoolExecutor 对 IO-bound 等价）
- 不做动态规则缓存（Actions 每次新容器，无法跨 run 生效）

## Decisions

### ThreadPoolExecutor 分组 + Session 复用

将 19 个标的分配到 `ThreadPoolExecutor(max_workers=5)` 中并发查询，共享一个 `requests.Session`。

**为什么不用 asyncio**：Finnhub Python SDK 是同步的（基于 `requests`），引入 async 需要自己调 REST API，维护成本高、收益低。

**rate limit 策略**：Finnhub 免费版 30 calls/s，5 并发远低于上限。移除 `time.sleep(0.5)` 固定间隔，改为 429 时 retry + backoff。

**为什么不用 Finnhub SDK 而直接调 REST API**：SDK 内部自建 HTTP 连接，无法与我方 Session 连接池整合。直接调 `/company-news` endpoint 更可控。

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|---------|
| Finnhub 并发触发 429 | 5 并发远低于 30 calls/s；加 429 检测 + exponential backoff |
| Finnhub SDK 替换为 REST 调用 | 仅替换 `company_news()` 一个方法，接口简单（GET + 3 参数） |
