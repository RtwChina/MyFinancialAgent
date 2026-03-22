## Context

当前新闻采集链路（`collect_news_v3.py`）经过 4 个阶段：采集 → 动态关键词生成 → 规则初筛 → LLM 批量增强。每个阶段的中间结果仅以日志形式输出，无法结构化回溯。关键问题：

- `LLM_CANDIDATE_LIMIT=10` 导致规则初筛后最多 10 条进入 LLM，信息损失大
- LLM 打星 prompt 缺乏锚定，导致几乎全部返回 5 星
- 关键词评分使用线性加权，缺乏业内验证
- 出问题时只能翻日志，无法按 pipeline_run 维度查询每条新闻的决策链

技术栈：Python 采集（GitHub Actions） → Cloudflare D1 存储 → Hono Workers API → 前端复盘页

## Goals / Non-Goals

**Goals:**
- 建立三级漏斗架构：关键词规则 → Embedding 语义过滤 → LLM 深度分析
- 三种关键词评分策略（A/B/C）并行计算，记录到 filter_log，数据驱动选最优
- 使用 DashScope text-embedding-v3 API 做语义过滤
- 通过 CoT + 锚定 + 分布约束 + 规则兜底校准打星
- 每次 pipeline 执行生成 trace 记录，每条新闻生成 filter_log 记录

**Non-Goals:**
- 不改动四个新闻源的抓取逻辑
- 不改动日总结（daily summary）生成逻辑
- 不改动前端复盘主流程（链路追踪 UI 留到后续迭代）
- 不引入本地 Embedding 模型（不装 PyTorch）
- 不做 pairwise 锦标赛排序（成本过高，留作后续）

## Decisions

### Decision 1: 三级漏斗架构

```
原始新闻 (~200条)
    │
    ▼ Stage 1: 关键词规则（三种策略并行评分）
    │  → 按 active_strategy 的分数决定保留/过滤
    │  → 三种策略的分数全部记入 filter_log
    │
    ~60条
    │
    ▼ Stage 2: Embedding 语义过滤
    │  → DashScope text-embedding-v3 API
    │  → 余弦相似度 < 阈值的过滤掉
    │
    ~30条
    │
    ▼ Stage 3: LLM 深度分析（合并原 Stage 3+4）
    │  → CoT 推理 + 打星 + 摘要 + keep/discard
    │
    最终结果
```

**Rationale**: 廉价 LLM 二分类和主力 LLM 深度分析合并为一步——既然 Embedding 已经做了语义过滤，进入 LLM 的只有 ~30 条，一次调用同时完成所有任务更高效。

### Decision 2: 关键词评分 A/B/C 三策略并行

三种策略共享同一套关键词表（静态 + 动态），区别在于评分公式：

**策略 A（现有方案）— 线性加权**：
```python
score = len(macro_hits) * 2.5 + len(market_hits) * 1.7 + len(symbol_hits) * 3.5 + ...
```

**策略 B（BM25 饱和）**：
```python
def bm25_saturate(count, weight, k1=1.2):
    return weight * (count * (k1 + 1)) / (count + k1)

score = bm25_saturate(len(macro_hits), 2.5) + bm25_saturate(len(market_hits), 1.7) + ...
```
效果：1 命中=1.09w，2 命中=1.50w，4 命中=1.85w（w=权重），抑制重复关键词的边际贡献。

**策略 C（BM25 饱和 + 标题加权）**：
```python
title_hits = count_hits(title, keywords)
body_hits = count_hits(content, keywords)
effective_count = title_hits * 2 + body_hits  # 标题命中权重 ×2
# 无标题时（title 为空）：effective_count = body_hits，退化为策略 B
score = bm25_saturate(effective_count, weight)
```

**实际过滤使用哪个策略**：通过 `RULE_ACTIVE_STRATEGY` 配置项控制（默认 `A`），三种分数全部记入 filter_log。后续通过分析 filter_log 数据选出最优策略后切换。

**无标题处理**：部分新闻源（Yahoo Finance 方法 1、金十部分快讯）可能没有独立标题。策略 C 中当 `title` 为空时，`title_hits=0`，自动退化为策略 B 的行为，不需要特殊处理。

### Decision 3: Embedding 语义过滤

**技术选型**：DashScope text-embedding-v3 API
- 已有 API Key（GitHub Actions secrets 中的 `LLM_API_KEY`）
- 安装体积 ~5MB（`dashscope` 包）
- 原生中英文支持
- 月成本约 3 元人民币

**实现方案**：

1. **标的 Profile 向量**：为每个 tracked_symbol 预定义一段 profile 文本（如 "Micron Technology MU 美光科技 DRAM NAND 半导体存储芯片"），启动时调用 API 生成 profile embeddings 并缓存
2. **新闻向量**：对 Stage 1 通过的 ~60 条新闻，批量调用 API 生成 embeddings
3. **相似度计算**：每条新闻与所有标的 profile 计算余弦相似度，取最大值
4. **过滤阈值**：`EMBEDDING_SIMILARITY_THRESHOLD`（默认 0.3），低于阈值的过滤掉
5. **结果记录**：每条新闻的最高相似度和匹配的标的记入 filter_log

**降级策略**：DashScope API 超时或异常时，跳过 Embedding 阶段，所有 Stage 1 通过的新闻直接进入 Stage 3。

**Profile 向量缓存**：标的列表变动频率极低（月级），profile embeddings 可以在每次 pipeline 执行时重新生成（~10 条标的，API 调用成本可忽略），避免引入额外缓存机制。

### Decision 4: pipeline_trace 表结构

每次 `run_news_pipeline()` 执行生成一条记录：

```sql
CREATE TABLE pipeline_trace (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL UNIQUE,
    run_date TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    status TEXT DEFAULT 'running',
    -- 三级漏斗数据
    total_fetched INTEGER DEFAULT 0,
    total_deduped INTEGER DEFAULT 0,
    rule_passed INTEGER DEFAULT 0,
    rule_filtered INTEGER DEFAULT 0,
    embedding_input INTEGER DEFAULT 0,
    embedding_passed INTEGER DEFAULT 0,
    embedding_filtered INTEGER DEFAULT 0,
    llm_input INTEGER DEFAULT 0,
    llm_kept INTEGER DEFAULT 0,
    llm_discarded INTEGER DEFAULT 0,
    final_count INTEGER DEFAULT 0,
    -- 耗时（秒）
    fetch_duration REAL,
    rule_duration REAL,
    embedding_duration REAL,
    llm_duration REAL,
    total_duration REAL,
    -- 配置与快照
    config_snapshot TEXT,
    dynamic_keywords TEXT,
    active_strategy TEXT DEFAULT 'A',
    star_fallback_triggered INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);
```

### Decision 5: news_filter_log 表结构

```sql
CREATE TABLE news_filter_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    news_hash TEXT NOT NULL,
    -- 三种关键词策略评分（全部记录）
    strategy_a_score REAL,
    strategy_b_score REAL,
    strategy_c_score REAL,
    active_strategy TEXT,
    rule_threshold REAL,
    macro_hits TEXT,           -- JSON array
    market_hits TEXT,
    noise_hits TEXT,
    symbol_hits TEXT,
    focus_hits TEXT,
    rule_decision TEXT,        -- 'pass' | 'filter'
    rule_reason TEXT,
    -- Embedding 阶段
    embedding_similarity REAL,
    embedding_matched_symbol TEXT,
    embedding_decision TEXT,   -- 'pass' | 'filter' | 'skipped'
    -- LLM 阶段
    llm_keep INTEGER,
    llm_stars INTEGER,
    llm_type TEXT,
    llm_summary TEXT,
    llm_cot_reasoning TEXT,    -- CoT 推理过程
    llm_raw_response TEXT,
    -- 最终决策
    final_decision TEXT,       -- 'kept' | 'rule_filtered' | 'embedding_filtered' | 'llm_discarded'
    created_at TEXT DEFAULT (datetime('now'))
);
```

**Rationale**: 一条记录包含三个阶段的全部数据。新闻未进入后续阶段时，对应字段为 NULL。三种策略评分字段独立存放，便于后续 SQL 分析对比。

### Decision 6: 打星校准方案

采用四层校准：

**层 1 — Chain-of-Thought**：要求 LLM 先输出推理过程：
```
对于每条新闻，请先列出：
1. 该新闻对跟踪标的重要的 2-3 个理由
2. 该新闻不重要的 2-3 个理由
3. 综合判断后给出 1-5 星评分
```
`llm_cot_reasoning` 字段记录推理过程。

**层 2 — 锚定示例**：system prompt 中 5 条示例（每星级 1 条），使用与跟踪标的相关的真实场景。

**层 3 — 分布约束**：prompt 中明确："5 星不超过 20%，4-5 星合计不超过 40%。"

**层 4 — 规则兜底**：LLM 返回后检查，若一批 ≥ 80% 为 5 星，按规则评分 `_score_to_stars()` 重新分配。

### Decision 7: API 端点

| 端点 | 说明 |
|------|------|
| `POST /api/ingest/pipeline-trace` | 写入/更新 trace |
| `POST /api/ingest/filter-logs` | 批量写入 filter_log |
| `GET /api/pipeline-traces?date=YYYY-MM-DD` | 按日期查询 trace |
| `GET /api/filter-logs?run_id=xxx&decision=kept` | 按 run_id 和决策查询 |

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| DashScope Embedding API 超时 | 降级跳过 Embedding 阶段，Stage 1 结果直接进 Stage 3 |
| filter_log 数据量大（每条新闻含 3 种策略分数） | D1 免费额度 5GB，日增 ~1-2MB，远低于上限；可加 TTL 定期清理 |
| 三策略并行增加规则阶段耗时 | 三种策略共享关键词命中结果，仅评分公式不同，额外计算 < 10ms |
| Embedding profile 文本不准导致过滤偏差 | 阈值可调（`EMBEDDING_SIMILARITY_THRESHOLD`），初期设低（0.3）宁可多留 |
| 标题加权遇到无标题新闻 | 策略 C 中 title 为空时自动退化为策略 B |
| 打星 CoT 增加 LLM token 消耗 | CoT 每条约增加 50-100 token，30 条增加 ~3000 token，成本可忽略 |
| 规则兜底可能覆盖 LLM 合理判断 | 仅极端情况（≥80% 五星）触发，保留 LLM 原始结果在 log 中 |
