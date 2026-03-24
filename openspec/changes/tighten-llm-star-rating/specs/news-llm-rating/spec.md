## ADDED Requirements

### Requirement: Stage 3 LLM Must Use Stricter Star Semantics

Stage 3 的批次 LLM 必须使用更严格的高星语义。

#### Scenario: 5 星必须代表改写主线
- **WHEN** LLM 对批次新闻输出 `importance_stars`
- **THEN** 5 星只应用于极少数改写当日交易主线的事件
- **AND** “只是重要但没有改写主线”的新闻不得给 5 星

#### Scenario: 4 星必须代表复盘重点输入
- **WHEN** LLM 对批次新闻输出 `importance_stars`
- **THEN** 4 星只应用于少数值得写入当天复盘重点段落的事件
- **AND** “重要补充但不属于最核心输入”的新闻应优先归入 3 星

### Requirement: Stage 3 LLM Must Follow Stricter Batch Distribution Caps

Stage 3 的批次 LLM 必须遵守更严格的高星比例约束。

#### Scenario: Batch caps are enforced
- **WHEN** LLM 为一批新闻输出星级
- **THEN** 5 星数量不得超过本批新闻的 5%
- **AND** 4 星数量不得超过本批新闻的 10%
- **AND** 4-5 星合计不得超过本批新闻的 20%

### Requirement: Stage 3 LLM Must Downrate Duplicative Or Non-Incremental Items

Stage 3 的批次 LLM 必须对重复主线新闻与无新增事实新闻降星。

#### Scenario: Same-theme follow-up items are downgraded
- **WHEN** 多条新闻属于同一主线事件
- **THEN** 只有最关键、最完整、最具决定性的少数新闻可以获得 4-5 星
- **AND** 其余后续重复快讯原则上降为 2-3 星

#### Scenario: No-new-fact commentary stays below 4 stars
- **WHEN** 新闻没有新增事实，只包含评论、媒体解读、盘中涨跌描述、评级目标价或摘要汇编
- **THEN** 该新闻通常不得高于 3 星
