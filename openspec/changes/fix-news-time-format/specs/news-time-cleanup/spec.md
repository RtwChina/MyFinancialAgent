## ADDED Requirements

### Requirement: remove-deprecated-format-function
MUST 删除 `src/data_sources/news_live.py` 中的 `_format_for_review_window()` 函数及其相关常量 `REVIEW_TZ`。

#### Scenario: 删除废弃函数
- **WHEN** 代码变更完成
- **THEN** `_format_for_review_window` 在整个代码库中不存在任何定义或调用
