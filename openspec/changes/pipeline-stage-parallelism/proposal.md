## Why

当前 pipeline 337s，两个主要低效点：

1. **动态规则 LLM 调用占 67s（20%）**：调一次 qwen3.5-plus 只为生成几十个关键词，且 Stage 1 是硬门槛——新热点没命中关键词就被砍掉，到不了 Stage 2 Embedding
2. **Finnhub company 串行 ~18s**：19 个标的逐个查 + 0.5s sleep

## What Changes

### 1. Stage 1 从硬过滤改为软加分

**去掉动态规则 LLM 调用**，Stage 1 不再过滤新闻，只用静态关键词给每条新闻打一个 `rule_score` 标签。所有新闻都进入 Stage 2 Embedding。

Stage 2 综合 `Embedding 相似度 + rule_score 加分` 决定是否保留：
- 命中关键词 + 语义相关 → 通过
- 没命中关键词但语义相关（新热点）→ 靠 Embedding 通过
- 既没关键词也没语义相关 → 过滤

### 2. Finnhub company 并发查询

19 个标的用 `ThreadPoolExecutor(max_workers=5)` 并发查询，共享 `requests.Session` 连接池。

### 3. 采集频率（已完成）

从每 1 小时改为每 2 小时。

### 不做项

- 不做 asyncio 重构
- 不做动态规则缓存（Actions 每次新容器，无效）
- 不改 LLM 打星逻辑（API 侧瓶颈，无法优化）

## Capabilities

### New Capabilities

- `soft-rule-scoring`: Stage 1 从硬过滤改为软加分，去掉动态规则 LLM 调用，所有新闻进入 Stage 2
- `finnhub-concurrent-fetch`: Finnhub 公司新闻并发查询

### Modified Capabilities

（无现有 spec 需修改）

## Impact

- **受影响文件**：
  - `src/collect_news_v3.py` — Stage 1 过滤逻辑、`generate_dynamic_screening_profile()` 移除、`collect_all_news()` 编排
  - `src/embedding_filter.py` — `filter_news_by_embedding()` 增加 rule_score 加分逻辑
  - `src/data_sources/news_live.py` — Finnhub company 并发
- **风险**：
  - Stage 2 输入量增大（~190 → ~286 条），Embedding API 调用多 ~10 条/batch → 已并发，多 1-2s
  - 软加分权重需要调参 → 先用简单线性加权，后续可调
- **预估收益**：
  - 去掉动态规则 LLM：**-67s**
  - Finnhub 并发：**-15s**
  - Stage 2 多处理 100 条：**+2s**
  - 总计：从 337s → **~257s（4.3 分钟）**
