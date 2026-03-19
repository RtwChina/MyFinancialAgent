## Context

两个 workflow 的职责划分：

| workflow | cron | 应调用 | 实际调用 |
|---|---|---|---|
| `collect_news.yml` | 每小时 | `hourly-news` | `full`（默认）❌ |
| `collect_prices.yml` | 每天 UTC 21:00 | `close-summary` | `close-summary` ✓ |

`hourly-news` mode = `run_news_collector(persist_summary=False)`，只采新闻，不写价格，不触发 LLM summary。

## Goals / Non-Goals

**Goals:**
- `collect_news.yml` 每小时只跑新闻采集

**Non-Goals:**
- 不修改 `main.py` 的 mode 逻辑
- 不修改 `collect_prices.yml`

## Decisions

单行修改：`python main.py` → `python main.py hourly-news`。

## Risks / Trade-offs

- 无风险，`hourly-news` mode 已有完整实现和日志
