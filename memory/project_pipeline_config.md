---
name: project_pipeline_config
description: Pipeline 默认配置（2026-03-21 回归测试后确定）
type: project
---

## Pipeline 默认配置

**确定日期**: 2026-03-21

```yaml
RULE_ACTIVE_STRATEGY: "C"
EMBEDDING_SIMILARITY_THRESHOLD: "0.50"
```

### 策略说明

- **Strategy C**: 标题 ×2 + 正文分别统计关键词命中，title 为空时退化为 Strategy B
- **阈值 0.50**: Embedding 相似度阈值，过滤率约 70-75%

### 回归测试数据 (R6)

- 输入 203 条 → 规则过滤 203 → Embedding 过滤 146 (72%) → LLM 过滤 13 (23%) → 最终 44 条
- 打星分布: 5★ (11%), 4★ (25%), 3★ (25%), 2★ (39%), 1★ (0%)
- 超时: 314s
- 无 star_fallback 触发