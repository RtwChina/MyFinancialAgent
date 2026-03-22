## Context

Pipeline 每 2 小时运行一次。数据源抓取分两类：
- **AkShare**（财联社/同花顺/新浪/富途）：API 返回最新快照，无日期参数，天然只有最近几十条，无问题
- **Finnhub general**：约 24h 内 100 条，无参数，无问题
- **Finnhub company**：调用 `company_news(symbol, _from, to)`，日期粒度只到天（YYYY-MM-DD），当前窗口 `now - 3天`

3 天窗口导致每轮 pipeline 重复拉入 2-3 天前已处理的文章，hash 预过滤（查 DB 中已存在 hash）本应拦住这批文章，但实测 0 条被跳过，根本原因就是这批旧文章每次都进来。

## Goals / Non-Goals

**Goals:**
- 将 Finnhub company 抓取窗口从 3 天缩短为 2 天（今天 + 昨天）
- 在 `merge_and_deduplicate` 之前加入时间截断：丢弃 `pub_date < now - 48h` 的所有文章
- hash 预过滤窗口从 4 天收回至 2 天，与抓取窗口保持对齐

**Non-Goals:**
- 不改变 AkShare / Finnhub general 的抓取逻辑（无日期参数，无需改）
- 不修改三级漏斗逻辑
- 不新增数据库字段或 migration

## Decisions

**决策 1：Finnhub company 窗口改为 2 天而非 1 天**

1 天（仅当日）在周一早盘前运行时会漏掉周五的新闻（周六、周日无交易日文章）。2 天（today + yesterday）在任何运行时间点都能保证覆盖最近一个交易日的新闻，同时不引入过多旧文章。

**决策 2：在 `merge_and_deduplicate` 之前加时间截断，而非修改各数据源**

AkShare 无日期参数，只能在汇总后统一截断。截断点放在 merge 之前，避免无效的 hash 计算。截断阈值与 Finnhub 窗口对齐（24h），保证两处逻辑一致。

**决策 3：hash 预过滤窗口从 4 天收回至 24h**

4 天是为了覆盖 Finnhub 3 天窗口而临时扩大的，现在抓取窗口变为 24h，预过滤只需查 24h 内的已存 hash，查询范围更小，性能更好。

## Risks / Trade-offs

- **偶发新闻延迟发布**：极少数情况下，新闻发布时间与事件发生时间相差超过 48h。截断后可能漏掉。接受此风险（影响极低，且这类新闻往往时效性已过）
- **首次部署后第一轮 pipeline**：旧缓存中可能还有超龄文章，但经过一次截断后自然消除，无需特殊处理
