## ADDED Requirements

### Requirement: Manual Snapshot Archiving for Daily Review

系统 SHALL 支持将 `daily_review_archive` 中指定 `archive_date` 的当前记录手动保存为版本快照。

#### Scenario: First snapshot for a review date

- **GIVEN** `daily_review_archive` 中存在 `archive_date='2026-03-20'` 的当前记录
- **AND** `daily_review_snapshots` 中尚无该日期快照
- **WHEN** 用户执行“归档当前版本”
- **THEN** 系统在 `daily_review_snapshots` 中新增一条记录
- **AND** 其 `version_no = 1`

#### Scenario: Second snapshot for the same review date

- **GIVEN** `daily_review_archive` 中存在 `archive_date='2026-03-20'` 的当前记录
- **AND** `daily_review_snapshots` 中已存在该日期 `version_no = 1`
- **WHEN** 用户再次执行“归档当前版本”
- **THEN** 系统新增一条快照记录
- **AND** 其 `version_no = 2`

### Requirement: Manual Snapshot Archiving for Daily AI Summary

系统 SHALL 支持将 `daily_news_ai_analysis` 中指定 `analysis_date` 的当前记录手动保存为版本快照。

#### Scenario: First snapshot for an analysis date

- **GIVEN** `daily_news_ai_analysis` 中存在 `analysis_date='2026-03-20'` 的当前记录
- **AND** `daily_news_ai_analysis_snapshots` 中尚无该日期快照
- **WHEN** 用户执行“归档当前版本”
- **THEN** 系统在 `daily_news_ai_analysis_snapshots` 中新增一条记录
- **AND** 其 `version_no = 1`

### Requirement: Snapshot Archiving Works Per Table Independently

系统在执行“归档当前版本”时 SHALL 允许 `daily_review_archive` 与 `daily_news_ai_analysis` 分别存在或缺失，不得要求两张主表必须同时有数据。

#### Scenario: Review exists but AI summary does not

- **GIVEN** `daily_review_archive` 中存在 `archive_date='2026-03-20'` 的记录
- **AND** `daily_news_ai_analysis` 中不存在 `analysis_date='2026-03-20'` 的记录
- **WHEN** 用户执行“归档当前版本”
- **THEN** 系统仍成功保存 `daily_review_snapshots`
- **AND** 对 AI summary 部分返回“当前记录不存在”或等价提示
