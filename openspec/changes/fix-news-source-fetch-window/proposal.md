## Why

Finnhub company news 每次使用 `now - 3天` 的日期窗口抓取，导致每轮 pipeline 都把 2-3 天前已入库的旧新闻重新喂入 Stage 1→2→3，hash 预过滤完全失效，Embedding + LLM 产生大量无效调用。

## What Changes

- **Finnhub company news 抓取窗口从 3 天缩减至 2 天**（覆盖今天 + 昨天，保留对跨日/周末的容错）
- **在各数据源抓取后、merge_and_deduplicate 之前，增加时间截断过滤**：丢弃 `pub_date < now - 24h` 的新闻，防止任何数据源带入超龄文章
- **hash 预过滤窗口从 4 天回退至 24h**（与截断阈值对齐，无需过宽）

## Capabilities

### New Capabilities
- `news-fetch-window-control`: 数据源抓取窗口统一受控，超出窗口的文章在入口处截断，不进入 pipeline

### Modified Capabilities
（无 spec 级别的需求变更）

## Impact

- `src/data_sources/news_live.py`：`fetch_finnhub_company` 的 `timedelta(days=3)` → `timedelta(days=2)`
- `src/collect_news_v3.py`：`merge_and_deduplicate` 之前新增时间截断函数；hash 预过滤窗口 `timedelta(days=4)` → `timedelta(days=2)`
