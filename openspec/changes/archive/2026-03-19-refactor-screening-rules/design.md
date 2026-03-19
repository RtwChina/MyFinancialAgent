## Context

初筛规则采用**双层词表架构**：
- **静态词表（基础层）**：通用固定的关键词，如 `美联储`、`通胀`、`财报` 等
- **动态词表（增量层）**：LLM 根据当日新闻实时生成的热点词，如 `海峡`、`中东局势` 等

当前问题：
1. 两套词表合并后日志无法区分来源
2. 动态词生成失败时静默回退到静态词，掩盖问题
3. `collect_prices.yml` 的 `SKIP_LLM=true` 导致不做动态词生成

## Goals / Non-Goals

**Goals:**
- 保留静态词表作为基础层
- LLM 动态词作为增量补充（合并而非替代）
- 日志清晰区分静态词与动态词来源
- 动态词生成失败时明确报错
- 开启 `collect_prices.yml` 的 LLM 调用

**Non-Goals:**
- 不改动 LLM prompt 内容
- 不改动评分算法（`apply_rule_filter`）

## Decisions

### 1. 词表合并架构

```
最终词表 = 静态词表（基础） + 动态词表（LLM增量）
```

**静态词表**（保留）：
- `BASE_MACRO_KEYWORDS` — 宏观关键词
- `BASE_MARKET_KEYWORDS` — 市场关键词
- `BASE_NOISE_KEYWORDS` — 噪音关键词
- `BASE_SYMBOL_CONTEXT_KEYWORDS` — 标的上下文关键词

**动态词表**（LLM 生成）：
- 热点事件词（如 `海峡`、`红海`）
- 当日主题词（如 `AI监管`、`芯片制裁`）

### 2. 日志区分来源

```python
# 期望日志格式
[初筛] 静态词表: 宏观=25词, 市场=22词, 噪音=12词
[初筛] 动态词表(由LLM生成): 新增宏观=3词[海峡,红海,胡塞], 新增市场=2词[AI监管], 动态主题=1个[中东局势]
[初筛] 合并后: 宏观=28词, 市场=24词, 噪音=12词
```

### 3. 失败处理

| 场景 | 行为 |
|------|------|
| LLM 调用成功 | 合并静态词 + 动态词 |
| LLM 调用失败 | 抛出 `RuntimeError`，记录错误日志 |
| JSON 解析失败 | 抛出 `RuntimeError`，记录原始响应前 500 字 |

### 4. 开启 collect_prices.yml 的 LLM

```yaml
# .github/workflows/collect_prices.yml
SKIP_LLM: "false"
```

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|----------|
| LLM 服务不可用时整个流程失败 | 监控告警 + 已有 `LLM_MAX_RETRIES` 重试机制 |
| 动态词可能包含无关词 | `_normalize_keyword_list` 已做清洗和去重 |