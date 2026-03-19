## MODIFIED Requirements

### Requirement: yahoo-source-ny-time
Yahoo Finance 来源的新闻，`time` / `pub_date` 字段 MUST 存储**北京时间**（`Asia/Shanghai`，格式 `YYYY-MM-DD HH:MM:SS`，24小时制），与中文源保持一致。

接口分类：B 类（不可控）— Yahoo Finance RSS/API 返回 UTC 时间，需在采集端转换。Mock 策略：测试时使用固定 UTC 时间字符串验证转换结果。

**Acceptance Criteria:**
- pubDate=`"2024-03-19T18:00:00Z"`（UTC 18:00）→ 存储为北京时间 `"2024-03-20 02:00:00"`

#### Scenario: Yahoo UTC 时间转北京时间
- **WHEN** Yahoo Finance 返回 pubDate=`"2024-06-15T14:30:00Z"`
- **THEN** `pub_date` 存储为 `"2024-06-15 22:30:00"`（UTC+8）

## ADDED Requirements

### Requirement: created-at-beijing-time
所有表的 `created_at` 字段 MUST 存储北京时间（`Asia/Shanghai`），不得依赖 SQLite `DEFAULT CURRENT_TIMESTAMP`（UTC）。写入时 MUST 由代码显式传入 `now_cst()` 返回值。

涉及表：`news_raw_data`、`stock_raw`、`tracked_symbols`。

#### Scenario: news_raw_data 写入时 created_at 为北京时间
- **WHEN** `upsert_news_data()` 插入一条新闻记录
- **THEN** `created_at` 值与 `captured_at` 在同一时区（北京时间），两者差值不超过1秒

#### Scenario: 所有时间字段时区一致
- **WHEN** 查询 `news_raw_data` 任意一行
- **THEN** `pub_date`、`captured_at`、`created_at` 三个字段均为北京时间，格式为 `YYYY-MM-DD HH:MM:SS`（24小时制）
