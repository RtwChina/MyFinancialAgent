## ADDED Requirements

### Requirement: Existing Daily Summary Prevents Recompute

当任务运行在 `persist_summary=true` 模式时，系统 SHALL 先检查 `daily_news_ai_analysis` 中是否已存在该 `analysis_date` 的记录。若已存在，则 SHALL 跳过日期级 summary 的候选加载、LLM 汇总与 summary 写入。

#### Scenario: Summary already exists for analysis date

- **GIVEN** `persist_summary=true`
- **AND** `daily_news_ai_analysis` 中已存在 `analysis_date='2026-03-20'` 的记录
- **WHEN** 运行 `python main.py close-summary`
- **THEN** 系统跳过 `load_news_for_summary()` 与 `build_daily_summary_record()`
- **AND** 不重新写入 `daily_news_ai_analysis`
- **AND** 日志输出“已存在 summary，跳过重算”之类的明确说明

### Requirement: Remote Summary Candidate Loading Uses Exact Time Window

系统在远端模式下为日期级 summary 加载候选新闻时，SHALL 按完整时间窗口查询，而不是将窗口截断为日期粒度。

#### Scenario: Candidate loading for NYSE close window

- **GIVEN** `analysis_date='2026-03-20'`
- **AND** 该交易日对应的新闻窗口为 `2026-03-20 04:00:00 ~ 2026-03-21 04:00:00`（北京时间）
- **WHEN** 系统加载日期级 summary 候选新闻
- **THEN** 远端查询 SHALL 覆盖完整时间窗口
- **AND** 不得因 `dateFrom/dateTo + limit=200 + 倒序排序` 导致窗口内新闻被截断

### Requirement: Summary Filter Logs Explain Empty Result

当日期级 summary 过滤后候选为空时，系统 SHALL 输出足够的诊断信息，说明候选为空的主要排除原因。

#### Scenario: Empty summary candidate set

- **GIVEN** 加载了 summary 候选原始新闻
- **WHEN** 过滤后候选数为 0
- **THEN** 日志 SHALL 至少区分时间窗外、星级不足、`rule_passed` 不符、`processing_status` 不符等主要原因
