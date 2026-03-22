## Why

新闻采集链路（采集 → 关键词生成 → 规则初筛 → LLM 过滤 → LLM 打星）当前是黑盒状态：每个环节的输入输出不可观测，无法回溯"为什么这条新闻被留下/丢弃"。具体痛点：

1. **初筛候选上限太低**：`LLM_CANDIDATE_LIMIT=10`，规则初筛后最多只有 10 条进入 LLM，大量潜在有价值新闻被丢弃
2. **打星偏高**：LLM 返回的 `importance_stars` 几乎全是 5 星，失去区分度
3. **黑盒不可调试**：动态关键词生成、规则评分、LLM 过滤决策缺乏结构化记录，出问题只能看日志猜

本次优化目标：让整条链路**可观测、可回溯、可调优**，为后续持续迭代新闻质量打下基础。

## What Changes

### 可观测性
- 新增 `pipeline_trace` 表，记录每次采集的全链路快照（采集数、初筛数、LLM 入参数、最终保留数、各环节耗时）
- 新增 `news_filter_log` 表，记录每条新闻在每个环节的决策详情（规则评分明细、Embedding 相似度、LLM 原始响应、保留/丢弃原因）
- 在前端复盘页面增加"链路追踪"入口，可查看每次采集的漏斗数据

### 多级漏斗架构（替代原有单级初筛）

采用三级漏斗，逐级缩小候选集：

```
200 条原始新闻
  → Stage 1: 关键词规则过滤                        → ~60 条
  → Stage 2: Embedding 语义过滤（DashScope API）    → ~30 条
  → Stage 3: LLM 深度分析（打星+摘要+keep/discard） → 最终结果
```

- **Stage 1 — 关键词规则 A/B/C 对比实验**：三种评分策略并行计算，结果全部记入 filter_log，以数据驱动选出最优策略：
  - **A（现有方案）**：线性加权子串匹配
  - **B（BM25 饱和）**：将线性计数改为 BM25 饱和函数，抑制重复关键词的边际贡献
  - **C（BM25 饱和 + 标题加权）**：在 B 基础上，标题命中权重 ×2（无标题时 fallback 为方案 B）
  - 实际过滤决策使用可配置的 `active_strategy`（默认 A，逐步切换）
- **Stage 2 — Embedding 语义过滤（新增）**：使用 DashScope text-embedding-v3 API 对新闻做向量化，与标的 profile 向量算余弦相似度，过滤语义不相关的新闻
- **Stage 3 — LLM 深度分析**：合并原有的"廉价 LLM 二分类"和"主力 LLM 深度分析"为一步，同时完成 keep/discard + 打星 + 摘要

### 打星校准
- 重写 LLM 打星 prompt，增加锚定示例（anchor examples），明确 1-5 星的边界
- 增加 Chain-of-Thought：要求 LLM 先列出"重要理由"和"不重要理由"，再给分
- 增加打星分布约束：prompt 中要求 5 星 ≤ 20%，4-5 星合计 ≤ 40%
- 增加打星后的规则兜底：如果一批 ≥ 80% 为 5 星，自动按规则评分拉开差距

## Capabilities

### New Capabilities
- `pipeline-tracing`: 全链路追踪——记录每次采集 pipeline 的漏斗数据和各环节耗时
- `news-filter-audit`: 逐条新闻过滤审计——记录每条新闻在规则初筛、Embedding 过滤和 LLM 过滤中的决策详情
- `keyword-scoring-experiment`: 关键词评分 A/B/C 对比实验——三种评分策略并行计算，结果记入 filter_log
- `embedding-semantic-filter`: Embedding 语义过滤——使用 DashScope text-embedding-v3 API 对新闻做语义相关性过滤
- `star-rating-calibration`: 打星校准——通过 CoT + 锚定 + 分布约束 + 规则兜底确保星级有区分度

### Modified Capabilities
- `news-timestamp-accuracy`: 无需求变更，但 filter log 中的时间字段需遵循现有北京时间规范

## Impact

- **受影响文件**：
  - `src/collect_news_v3.py` — 主要改动：三级漏斗重构、三种评分策略、Embedding 过滤、打星 prompt 重写、追踪数据采集
  - `src/config.py` — 新增 DashScope Embedding 配置、评分策略切换配置
  - `requirements.txt` — 新增 `dashscope` 依赖
  - `cloudflare/migrations/` — 新增 trace 和 filter_log 表
  - `cloudflare/worker/src/index.js` — 新增 trace/log 写入和查询 API
  - `.github/workflows/collect_news.yml` — 新增 DashScope API Key secret（复用现有 key）
- **不做项**：
  - 不改动新闻源采集逻辑（四个数据源的抓取方式不变）
  - 不改动日总结（daily summary）生成逻辑
  - 不改动前端复盘主流程（仅新增链路追踪入口）
- **风险**：
  - filter_log 数据量较大（每条新闻 × 3 种策略评分），需注意 D1 存储成本
  - DashScope Embedding API 引入外部依赖，需处理超时降级
  - 打星 prompt 调整可能需要多轮迭代才能达到理想分布
