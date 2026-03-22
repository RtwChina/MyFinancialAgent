## Why

新闻 pipeline 单次执行约 337s（5.6 分钟），其中 Finnhub 公司新闻采集阶段串行查询 19 个标的，含 0.5s 固定间隔，耗时 ~20s。

## What Changes

- **Finnhub 公司新闻并发查询**：在 Finnhub rate limit 允许范围内（30 calls/s），用线程池并发查多个标的，预计从 ~20s 降到 ~5s

### 不做项

- 不做动态规则缓存（GitHub Actions 每次都是新容器，缓存无法跨 run 生效）
- 不更换 LLM 模型或提供商（DashScope qwen3.5-flash 单 batch 50-65s 是 API 侧延迟，无法在我方优化）
- 不增加 `LLM_MAX_WORKERS` 超过 5（已验证 5 并发 + Session 连接池是稳定上限）

## Capabilities

### New Capabilities

- `finnhub-concurrent-fetch`: Finnhub 公司新闻从串行改为并发查询，在 rate limit 约束内最大化吞吐

### Modified Capabilities

（无现有 spec 需修改）

## Impact

- **受影响文件**：`src/data_sources/news_live.py` — Finnhub 公司新闻查询逻辑
- **风险**：Finnhub 并发过高可能触发 429 rate limit → 需加入 retry + backoff
- **环境**：本地开发和 GitHub Actions 生产环境均受益
