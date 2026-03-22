## Context

当前 pipeline 337s，动态规则 LLM 占 67s（20%），Finnhub 串行占 18s。Stage 1 作为硬门槛会误杀未命中关键词的新热点。

## Goals / Non-Goals

**Goals:**
- 去掉动态规则 LLM 调用，省 67s
- Stage 1 改为软加分，新热点不再被误杀
- Finnhub 并发查询，省 15s
- 总耗时从 337s 降到 ~257s

**Non-Goals:**
- 不做 asyncio 重构
- 不改 Stage 3 LLM 打星逻辑

## Decisions

### 1. Stage 1 只打分不过滤

**现状**：`filter_news_by_rules()` 返回 `(passed, rejected)`，rejected 的新闻永远到不了 Stage 2。

**改为**：`score_news_by_rules()` 返回所有新闻（每条附加 `rule_score`），不再区分 passed/rejected。

```python
# 之前
filtered_news, rejected_news = filter_news_by_rules(unique_news, screening_profile)
# Stage 2 只处理 filtered_news

# 改后
scored_news = score_news_by_rules(unique_news)
# Stage 2 处理全量 scored_news
```

### 2. Stage 2 综合评分公式

```python
combined = embedding_similarity + rule_score * RULE_SCORE_WEIGHT

# RULE_SCORE_WEIGHT 默认 0.02
# 举例：rule_score=5（命中多个关键词），加分 0.10
# 原本 embedding_similarity=0.35（低于 0.40 阈值）→ 综合 0.45 → 通过
# 效果：关键词命中的新闻更容易通过 Embedding 阈值
```

**为什么 0.02**：当前 Strategy C 的 rule_score 范围约 0-10，乘以 0.02 = 0-0.20 的加分，不会喧宾夺主但能帮助边缘新闻通过。

### 3. 去掉 `generate_dynamic_screening_profile()`

- 不再调用 LLM 生成动态关键词
- `_get_static_screening_base()` 作为唯一关键词来源
- 将历次动态规则中有价值的高频词（如 "制裁"、"earnings"、"AI"）沉淀到静态词表

### 4. Finnhub 并发

`fetch_finnhub_company()` 改为 `ThreadPoolExecutor(max_workers=5)` + 共享 Session，移除 `time.sleep(0.5)`。

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|---------|
| Stage 2 输入增大 ~100 条 | Embedding 已并发，多 1-2s |
| 去掉动态规则后关键词覆盖度降低 | 将历次高频动态词沉淀到静态词表；新热点靠 Embedding 语义兜底 |
| `RULE_SCORE_WEIGHT` 需要调参 | 默认 0.02 保守起步，后续可通过回归测试调整 |
| Stage 1 不过滤 → Stage 3 LLM 负载增大？ | 不会，Stage 2 Embedding 仍是硬门槛，过滤率不变 |
