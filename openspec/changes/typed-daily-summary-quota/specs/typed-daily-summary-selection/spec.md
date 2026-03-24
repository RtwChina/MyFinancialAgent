## ADDED Requirements

### Requirement: Daily Summary Uses Typed Candidate Selection

系统 MUST 在日期级 summary 阶段仅使用标准新闻类型 `index / sector / stock` 进行候选分桶与选入。

#### Scenario: Summary candidates are filtered by stars >= 4

- **WHEN** 系统为某个 `analysis_date` 加载日期级 summary 候选新闻
- **THEN** 只有 `importance_stars >= 4` 的新闻才可以进入 summary 分桶阶段
- **AND** 候选新闻 MUST 仍满足 `rule_passed = 1`
- **AND** 候选新闻 MUST 仍满足 `processing_status ∈ {llm_processed, reviewed}`

### Requirement: Summary Selection Uses Floor And Flexible Fill

系统 MUST 使用“保底 + 弹性”策略从三类新闻中选取日期级 summary 入参。

#### Scenario: Each type gets a guaranteed floor before flexible fill

- **WHEN** summary 候选新闻已经按 `index / sector / stock` 分桶
- **THEN** 系统 MUST 先从每个桶中按 `importance_stars DESC, pub_date DESC` 取到该桶的保底数量
- **AND** 若某个桶候选数量不足保底值，系统 MUST 只取该桶的实际候选数量
- **AND** 系统 MUST 将剩余未选候选合并后按全局重要性继续补位
- **AND** 最终入参数量 MUST NOT 超过该变更定义的 summary 总上限

#### Scenario: Final source_news_ids contains all selected summary inputs

- **WHEN** summary 选入阶段完成
- **THEN** `daily_news_ai_analysis.source_news_ids` MUST 保存全部实际 summary 入参新闻的 id
- **AND** `source_news_ids` MUST NOT 仅保存单一全局排序前 20 条新闻

#### Scenario: Typed candidate logs expose qualifying ids

- **WHEN** 系统完成日期级 summary 的分桶与选入前过滤
- **THEN** 日志 MUST 分别输出 `index`、`sector`、`stock` 三桶中“符合要求”的新闻数量
- **AND** 日志 MUST 分别输出三桶对应新闻的 id 列表
