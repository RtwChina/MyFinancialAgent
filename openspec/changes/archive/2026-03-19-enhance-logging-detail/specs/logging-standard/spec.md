## MODIFIED Requirements

### Requirement: LLM 调用完成日志
每次 LLM 调用完成后输出完成日志。

#### Scenario: LLM 调用成功
- **WHEN** `call_chat` 返回成功结果
- **THEN** 输出 INFO 日志: `LLM 完成: model=X, 耗时 X.Xs, prompt X字, response X字`

#### Scenario: LLM 调用失败
- **WHEN** `call_chat` 返回失败结果
- **THEN** 输出 ERROR 日志: `LLM 失败: model=X, 耗时 X.Xs, error=X`

### Requirement: 日总结详细日志
日总结阶段输出完整的加载、过滤、AI 入参出参信息。

#### Scenario: 加载候选新闻
- **WHEN** `load_news_for_summary` 开始执行
- **THEN** INFO 日志输出窗口范围、数据源类型、加载数量、去重后数量、过滤条件、过滤后候选数量

#### Scenario: AI 入参出参
- **WHEN** `build_daily_summary_record` 调用 LLM
- **THEN** INFO 日志输出候选新闻标题列表（入参）和 LLM 返回文本前 300 字（出参）

### Requirement: 批次分析中文约束
批次分析 LLM 返回内容必须为中文。

#### Scenario: 英文新闻
- **WHEN** 输入新闻为英文
- **THEN** ai_summary 和 market_impact 仍为中文
