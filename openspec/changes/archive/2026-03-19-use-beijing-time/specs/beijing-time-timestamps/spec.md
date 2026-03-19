## ADDED Requirements

### Requirement: 时间戳字段使用北京时间写入

系统写入 `updated_at`、`captured_at`、`reviewed_at` 等时间戳时，SHALL 使用北京时间（UTC+8，格式 `YYYY-MM-DD HH:MM:SS`）。

#### Scenario: Worker 写入 updated_at

- **GIVEN** Worker 执行任意写库操作（initialize、save draft、complete review 等）
- **WHEN** 调用 `isoNow()`
- **THEN** 返回值为北京时间字符串，如 `2026-03-18 21:13:52`（不含时区标识）

#### Scenario: Python 写入 captured_at / updated_at

- **GIVEN** Python 脚本（`collect_news_v3.py`、`collect_prices.py`、`db_utils.py`）写入新记录
- **WHEN** 填充时间戳字段
- **THEN** 写入北京时间字符串，格式同上

#### Scenario: 业务日期字段不受影响

- **GIVEN** 任意写库操作
- **WHEN** 写入 `k_date`、`archive_date`、`pub_date`
- **THEN** 这些字段的值和逻辑不变（交易日语义不修改）
