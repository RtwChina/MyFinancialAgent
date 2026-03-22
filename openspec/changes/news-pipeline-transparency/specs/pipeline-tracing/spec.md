## ADDED Requirements

### Requirement: pipeline-run-tracking
每次 `run_news_pipeline()` 执行 SHALL 生成一条 `pipeline_trace` 记录，包含唯一 `run_id`（UUID）、执行状态和完整漏斗数据。

#### Scenario: 正常执行完成
- **GIVEN** pipeline 开始执行
- **WHEN** 采集、初筛、LLM 增强全部正常完成
- **THEN** `pipeline_trace` 记录 `status='completed'`，且 `total_fetched >= total_deduped >= rule_passed >= llm_input >= llm_kept = final_count`

#### Scenario: pipeline 执行中断
- **GIVEN** pipeline 在任意阶段抛出异常
- **WHEN** 异常被捕获
- **THEN** `pipeline_trace` 记录 `status='failed'`，`error_message` 包含异常信息，已完成阶段的漏斗数据仍被记录

### Requirement: pipeline-duration-tracking
pipeline_trace SHALL 记录各阶段的独立耗时（秒）：`fetch_duration`、`rule_duration`、`llm_duration`、`total_duration`。

#### Scenario: 耗时记录精度
- **GIVEN** pipeline 正常执行
- **WHEN** 执行完成
- **THEN** `total_duration` 与 `started_at` 到 `finished_at` 的差值误差 ≤ 1 秒，且 `fetch_duration + rule_duration + llm_duration ≤ total_duration`

### Requirement: config-snapshot
pipeline_trace SHALL 在 `config_snapshot` 字段记录本次执行的关键配置（JSON 格式），至少包含：`LLM_CANDIDATE_LIMIT`、`LLM_BATCH_SIZE`、`LLM_MAX_WORKERS`、`score_threshold`、`LLM_BATCH_MODEL_ID`、`LLM_RULES_MODEL_ID`。

#### Scenario: 配置变更可追溯
- **GIVEN** 用户将 `LLM_CANDIDATE_LIMIT` 从 25 改为 30
- **WHEN** 下一次 pipeline 执行
- **THEN** 新的 `pipeline_trace.config_snapshot` 中 `LLM_CANDIDATE_LIMIT=30`，旧记录中仍为 25

### Requirement: dynamic-keywords-snapshot
pipeline_trace SHALL 在 `dynamic_keywords` 字段记录本次 LLM 动态生成的关键词（JSON 格式），包含 `macro_keywords`、`market_keywords`、`noise_keywords`、`focus_topics`。

#### Scenario: 动态关键词可回溯
- **GIVEN** LLM 为本次执行生成了动态关键词
- **WHEN** pipeline 完成
- **THEN** `pipeline_trace.dynamic_keywords` 包含完整的动态关键词列表，与日志中输出的一致

### Requirement: trace-query-api
系统 SHALL 提供 `GET /api/pipeline-traces` 端点，支持按日期查询。

#### Scenario: 按日期查询
- **GIVEN** 2026-03-20 执行了 4 次 pipeline
- **WHEN** 请求 `GET /api/pipeline-traces?date=2026-03-20`
- **THEN** 返回 4 条记录，按 `started_at` 降序排列

### Requirement: trace-timestamps-beijing
pipeline_trace 的 `started_at`、`finished_at`、`created_at` 字段 SHALL 存储北京时间（Asia/Shanghai），格式 `YYYY-MM-DD HH:MM:SS`。

#### Scenario: 时间一致性
- **GIVEN** pipeline 在北京时间 2026-03-20 06:30:00 执行
- **WHEN** 记录写入
- **THEN** `started_at = '2026-03-20 06:30:00'`，不使用 UTC
