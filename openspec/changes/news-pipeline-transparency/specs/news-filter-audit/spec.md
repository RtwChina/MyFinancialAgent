## ADDED Requirements

### Requirement: rule-stage-logging
规则初筛阶段 SHALL 为每条新闻生成一条 `news_filter_log` 记录，包含：三种策略评分（`strategy_a_score`、`strategy_b_score`、`strategy_c_score`）、`active_strategy`、`rule_threshold`、命中关键词列表（`macro_hits`、`market_hits`、`noise_hits`、`symbol_hits`、`focus_hits`）、`rule_decision`（pass/filter）、`rule_reason`。

第三方接口分类：规则初筛为纯本地计算（A 类，无外部依赖），无需 mock。

#### Scenario: 通过规则的新闻
- **GIVEN** 一条新闻标题包含"美联储降息"，active_strategy=A，strategy_a_score=8.2，threshold=4.5
- **WHEN** 规则初筛执行
- **THEN** filter_log 记录 `rule_decision='pass'`，三种策略分数均有值，`macro_hits` 包含 `["美联储","降息"]`

#### Scenario: 被规则过滤的新闻
- **GIVEN** 一条新闻所有策略分数均低于 threshold
- **WHEN** 规则初筛执行
- **THEN** filter_log 记录 `rule_decision='filter'`，三种策略分数均有值，`rule_reason` 说明过滤原因

### Requirement: embedding-stage-logging
Embedding 过滤阶段 SHALL 更新 filter_log 记录，填入 `embedding_similarity`、`embedding_matched_symbol`、`embedding_decision`。

#### Scenario: Embedding 通过
- **GIVEN** 一条新闻与 MU profile 的余弦相似度 = 0.65
- **WHEN** Embedding 过滤执行
- **THEN** filter_log 更新 `embedding_decision='pass'`，`embedding_similarity=0.65`，`embedding_matched_symbol='MU'`

#### Scenario: Embedding 降级跳过
- **GIVEN** DashScope API 超时
- **WHEN** 降级处理
- **THEN** 所有 filter_log 记录 `embedding_decision='skipped'`

### Requirement: llm-stage-logging
LLM 过滤阶段 SHALL 更新 filter_log 记录，填入 `llm_keep`、`llm_stars`、`llm_type`、`llm_summary`、`llm_cot_reasoning`、`llm_raw_response`。

第三方接口分类：LLM API（B 类，不可控）。测试时使用录制回放或固定 mock 响应。

#### Scenario: LLM 保留的新闻
- **GIVEN** 一条新闻进入 LLM 深度分析
- **WHEN** LLM 返回 `keep=true, importance_stars=4`
- **THEN** filter_log 更新 `llm_keep=1`，`llm_stars=4`，`llm_cot_reasoning` 包含推理过程

#### Scenario: LLM 丢弃的新闻
- **GIVEN** 一条新闻进入 LLM 深度分析
- **WHEN** LLM 返回 `keep=false, importance_stars=1`
- **THEN** filter_log 更新 `llm_keep=0`，`llm_stars=1`，`final_decision='llm_discarded'`

#### Scenario: LLM 调用失败降级
- **GIVEN** LLM API 超时或返回异常
- **WHEN** 降级处理触发
- **THEN** filter_log 记录 `llm_raw_response` 包含错误信息，`llm_keep=1`（降级保留）

### Requirement: final-decision-tracking
每条新闻的 filter_log SHALL 包含 `final_decision` 字段，取值为 `kept`（最终保留）、`rule_filtered`（规则过滤）、`embedding_filtered`（Embedding 过滤）、`llm_discarded`（LLM 丢弃）。

#### Scenario: 全链路决策可追溯
- **GIVEN** 100 条新闻进入 pipeline
- **WHEN** pipeline 完成后查询 filter_log
- **THEN** 100 条记录的 `final_decision` 分布之和 = 100

### Requirement: filter-log-query-api
系统 SHALL 提供 `GET /api/filter-logs` 端点，支持按 `run_id` 和 `final_decision` 过滤。

#### Scenario: 查询某次执行被 Embedding 过滤的新闻
- **GIVEN** run_id='abc-123' 的 pipeline 执行完成
- **WHEN** 请求 `GET /api/filter-logs?run_id=abc-123&decision=embedding_filtered`
- **THEN** 返回该次执行中被 Embedding 过滤的所有新闻的过滤日志

### Requirement: filter-log-write-resilience
filter_log 的写入失败 SHALL NOT 阻塞 pipeline 主流程。

#### Scenario: D1 写入超时
- **GIVEN** filter_log 批量写入 D1 超时
- **WHEN** 异常被捕获
- **THEN** pipeline 继续执行，错误记录到日志

冒烟用例触发条件：当 filter_log 写入逻辑有代码变更时，需验证：(1) 三阶段数据正常写入 (2) 写入失败不阻塞主流程。
