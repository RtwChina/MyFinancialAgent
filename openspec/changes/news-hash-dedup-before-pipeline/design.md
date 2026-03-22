## Context

`collect_all_news()` 每 2 小时运行一次，每次抓取 ~280-330 条新闻。其中大部分是上次已处理入库的。当前 pipeline 对全量新闻走 Stage 1（规则软加分）→ Stage 2（Embedding）→ Stage 3（LLM），只在最后 `upsert` 时才忽略重复。

实测：135 条进入 Stage 3，LLM 调用约 23 批次。预估其中 60-80% 是重复处理。

## Goals / Non-Goals

**Goals:**
- 在 Stage 1 前从远端（或本地 DB）拉取当日已存在的 `news_hash` 集合
- 过滤掉已处理的新闻，只让新增的进入三级漏斗
- pipeline_trace 新增字段 `prefilter_skipped` 记录跳过数量

**Non-Goals:**
- 不改变三级漏斗本身逻辑
- 不做跨日去重（只对 `analysis_date` 当日）
- 不影响 `SKIP_LLM=true` 模式的行为

## Decisions

**决策 1：新增轻量接口 `GET /api/news/hashes?dateFrom=&dateTo=`**

现有 `/api/news` 返回完整字段，拉取 hash 列表用途不需要这些数据，单独一个轻量接口更合适：
- 查询：`SELECT news_hash FROM news_raw_data WHERE pub_date >= ? AND pub_date < ?`
- 时间范围由调用方传入（`get_analysis_window(analysis_date)` 返回的起止时间，约 24 小时）
- 返回：`{"hashes": ["abc...", "def...", ...], "count": 142}`
- 无需鉴权（只读，hash 本身无敏感信息）

备选：复用 `/api/news?dateFrom=xxx&dateTo=xxx&limit=500` 提取 hash 字段。缺点：传输 5-10x 多余数据，且有 limit 上限问题。

**决策 2：本地环境从 SQLite 直接查询**

`context.is_local_env` 为 True 时，直接 `SELECT news_hash FROM news_raw_data WHERE pub_date >= ? AND pub_date < ?`，无需 HTTP 调用。

**决策 3：时间范围使用过去 24 小时（`now - 24h` 到 `now`）**

Pipeline 每 2 小时跑一次，过去 24 小时内已处理入库的新闻即为需要跳过的范围。不依赖交易日概念，逻辑简单直接。

**决策 4：预过滤放在 `merge_and_deduplicate` 之后、Stage 1 之前**

去重后再预过滤，减少 hash 查询集合的噪音（跨源重复已消除）。

**预过滤流程：**

```
merge_and_deduplicate (291条)
        ↓
fetch_existing_hashes(analysis_date)  ← 新增：从远端/本地拉取已存 hash
        ↓
过滤掉已存在 hash (例如 200条)
        ↓
Stage 1 (仅处理新增 ~91条)
        ↓
Stage 2 Embedding (新增中过滤)
        ↓
Stage 3 LLM (大幅减少批次)
```

**`fetch_existing_hashes` 失败时的处理：**
- 记录 WARNING 日志，不中断 pipeline
- 返回空集合（等同于不过滤），保证降级下数据不丢失

## Risks / Trade-offs

- **首次运行当日（hash 集合为空）**：正常全量处理，无副作用
- **API 拉取失败**：降级为不过滤，pipeline 继续，仅多消耗资源
- **hash 碰撞极低概率**：MD5/SHA 的碰撞率在此场景可忽略
- **跨日新闻**：若新闻 pub_date 跨两天（如 UTC vs 北京时间边界），过滤条件只看 `analysis_date` 当日，不会误删
