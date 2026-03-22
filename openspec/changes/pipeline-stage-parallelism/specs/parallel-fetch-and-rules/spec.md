## ADDED Requirements

### Requirement: Stage 1 软加分替代硬过滤

`filter_news_by_rules()` SHALL 不再丢弃任何新闻，改为给每条新闻计算 `rule_score` 并附加到新闻字典中，所有新闻均进入 Stage 2。

**接口分类**：A 类（可控，内部逻辑）

#### Scenario: 命中关键词的新闻

- **WHEN** 一条新闻命中了静态关键词（宏观/市场/标的）
- **THEN** 系统 SHALL 计算 `rule_score`（使用 Strategy C 的 BM25+标题加权算法）
- **THEN** `rule_score` SHALL 附加到新闻字典的 `_scoring.rule_score` 字段
- **THEN** 该新闻 SHALL 继续进入 Stage 2 Embedding

#### Scenario: 未命中关键词的新闻（新热点）

- **WHEN** 一条新闻未命中任何静态关键词
- **THEN** `rule_score` SHALL 为 0
- **THEN** 该新闻 SHALL 仍然进入 Stage 2 Embedding
- **THEN** 如果 Embedding 相似度高于阈值，该新闻 SHALL 被保留

### Requirement: 去掉动态规则 LLM 调用

`collect_all_news()` SHALL 不再调用 `generate_dynamic_screening_profile()`。Stage 1 仅使用静态关键词表。

#### Scenario: Pipeline 启动不调用 LLM 生成规则

- **WHEN** pipeline 执行 `collect_all_news()`
- **THEN** SHALL 不调用 `generate_dynamic_screening_profile()`
- **THEN** Stage 1 SHALL 仅使用 `_get_static_screening_base()` 返回的静态词表
- **THEN** pipeline trace 中 `rule_duration` SHALL 不包含 LLM 调用耗时

### Requirement: Stage 2 综合评分

`filter_news_by_embedding()` SHALL 在相似度计算基础上，结合 `rule_score` 加分做最终过滤决策。

#### Scenario: Embedding 相似度 + rule_score 综合判定

- **WHEN** 一条新闻的 Embedding 相似度为 `sim`，rule_score 为 `rs`
- **THEN** 系统 SHALL 计算综合分 `combined = sim + rs * RULE_SCORE_WEIGHT`
- **THEN** 如果 `combined >= EMBEDDING_SIMILARITY_THRESHOLD`，SHALL 保留
- **THEN** 如果 `combined < EMBEDDING_SIMILARITY_THRESHOLD`，SHALL 过滤
- **THEN** 新增环境变量 `RULE_SCORE_WEIGHT`（默认 0.02），控制关键词加分权重

#### Scenario: 纯语义通过（新热点路径）

- **WHEN** 一条新闻 `rule_score = 0` 但 `sim >= EMBEDDING_SIMILARITY_THRESHOLD`
- **THEN** 该新闻 SHALL 被保留（Embedding 单独就够了）

### Requirement: 漏斗数据兼容

pipeline_trace 和 filter_log SHALL 保持与当前一致的字段结构。

#### Scenario: Trace 数据字段不变

- **WHEN** pipeline 执行完成
- **THEN** `trace` SHALL 仍包含 `rule_passed`（现在等于全量）、`embedding_passed`、`llm_kept` 等字段
- **THEN** filter_log 的每条记录 SHALL 仍包含 `rule_decision`（现在全部为 "pass"）、`embedding_decision`、`llm_keep` 等字段
