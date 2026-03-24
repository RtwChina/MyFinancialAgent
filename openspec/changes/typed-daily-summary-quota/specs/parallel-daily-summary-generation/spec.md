## ADDED Requirements

### Requirement: Daily Summary Is Generated From Parallel Typed Subsummaries

系统 MUST 将日期级 summary 生成拆分为三类子总结，并由程序拼装最终结果。

#### Scenario: Three typed summaries run in parallel

- **WHEN** 日期级 summary 已经确定最终入参新闻
- **THEN** 系统 MUST 分别针对 `index`、`sector`、`stock` 三桶生成独立子总结
- **AND** 三个子总结 MUST 可以并行执行
- **AND** 某个桶没有候选新闻时，系统 MUST 允许该桶跳过而不阻塞其他桶

#### Scenario: Final daily summary is assembled from typed subsummaries

- **WHEN** 三个子总结都已完成或跳过
- **THEN** 系统 MUST 基于可用的子总结结果由程序拼装最终日期级 summary
- **AND** 最终输出 MUST 仍包含：
  - `daily_major_events`
  - `sector_impact_map`
  - `linkage_logic_chain`

### Requirement: Typed Daily Summary Uses Dedicated Model Configuration

系统 MUST 为日期级日总结使用独立配置的模型与超时参数。

#### Scenario: Daily summary model configuration is explicit

- **WHEN** 系统执行日期级 summary 的子总结调用
- **THEN** 系统 MUST 优先使用 `LLM_DAILY_SUMMARY_MODEL_ID`
- **AND** 系统 MUST 优先使用 `LLM_DAILY_SUMMARY_TIMEOUT`
- **AND** 若新配置缺失，系统 MAY 回退到旧的 `LLM_SUMMARY_MODEL_ID / LLM_SUMMARY_TIMEOUT`

### Requirement: Typed Summary Logging Is Diagnostic

系统 MUST 输出足够的日志来解释 summary 配额与分桶结果。

#### Scenario: Logs show bucket counts and final inputs

- **WHEN** 系统完成日期级 summary 选入
- **THEN** 日志 MUST 输出三桶候选数量
- **AND** 日志 MUST 输出三桶“符合要求”的新闻数量与新闻 id
- **AND** 日志 MUST 输出保底阶段各桶选入数量
- **AND** 日志 MUST 输出弹性补位后各桶最终入参数量
- **AND** 日志 MUST 输出三桶最终进入 LLM 的新闻数量与新闻 id
- **AND** 日志 MUST 输出最终 `source_news_ids` 数量
