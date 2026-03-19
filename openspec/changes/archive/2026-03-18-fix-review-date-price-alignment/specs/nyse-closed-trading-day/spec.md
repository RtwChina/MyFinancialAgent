## ADDED Requirements

### Requirement: Worker 以 ^GSPC 代理推断最近已收盘 NYSE 交易日

系统 SHALL 通过查询 `stock_raw` 中 `^GSPC` 的最新 `k_date` 作为"最近已收盘 NYSE 交易日"的唯一来源，替代 `MAX(stock_raw.k_date)` 全市场最大日期。

调用方：`getPendingReviews()`、`initializeReview()`（凡需要确定复盘候选日的路径）。

第三方依赖分类：
- `^GSPC` 采集器（yfinance / Yahoo Finance）：**B 类（不可控）**
  - Mock 策略：测试时直接向 `stock_raw` 注入 `symbol='^GSPC'` 的种子数据，不调用真实 yfinance

#### Scenario: 亚洲指数已进入下一自然日，美股尚未收盘

- **GIVEN** `stock_raw` 中 `^HSI` 的最新 `k_date = '2026-03-18'`，`^GSPC` 的最新 `k_date = '2026-03-17'`
- **WHEN** 调用 `getLatestClosedNyseTradingDay(env)`
- **THEN** 返回 `'2026-03-17'`，而非 `'2026-03-18'`

#### Scenario: 美股已收盘，^GSPC 已写入当日价格

- **GIVEN** `stock_raw` 中 `^GSPC` 的最新 `k_date = '2026-03-18'`
- **WHEN** 调用 `getLatestClosedNyseTradingDay(env)`
- **THEN** 返回 `'2026-03-18'`

#### Scenario: ^GSPC 无数据（极端情况）

- **GIVEN** `stock_raw` 中不存在 `symbol = '^GSPC'` 的任何记录
- **WHEN** 调用 `getLatestClosedNyseTradingDay(env)`
- **THEN** 返回 `null`，`getPendingReviews` 返回 `{ items: [], latestClosedDate: null }`，不抛出异常

### Requirement: Python close-summary / full 使用最近已收盘 NYSE 交易日

`close-summary` 和 `full` 命令落库 `daily_news_ai_analysis` 和 `daily_review_archive` 时，SHALL 使用 `get_latest_closed_trading_day()` 作为 `analysis_date` / `archive_date`，不得使用 `get_current_review_trading_day()`。

`hourly-news` 命令的原始新闻归档不受此约束。

第三方依赖分类：
- `pandas_market_calendars`（NYSE 日历）：**A 类（可控）**
  - Mock 策略：通过 `ExecutionContext.clock` 注入固定时间，无需 mock 外部库

#### Scenario: 北京时间上午执行 close-summary（NYSE 尚未开盘）

- **GIVEN** 当前时间为北京时间 `2026-03-18 09:00`（即纽约时间 `2026-03-17 21:00`，NYSE 已收盘）
- **WHEN** 执行 `main.py close-summary`
- **THEN** `analysis_date` 和 `archive_date` 均为 `'2026-03-17'`

#### Scenario: 纽约时间盘中执行 full（NYSE 当天未收盘）

- **GIVEN** 当前时间为纽约时间 `2026-03-18 14:00`（NYSE 正在交易中）
- **WHEN** 执行 `main.py full`
- **THEN** `analysis_date` 和 `archive_date` 为 `'2026-03-17'`（最近已收盘日），不得为 `'2026-03-18'`
