## Why

所有时间戳（`updated_at`、`captured_at`、`reviewed_at` 等）目前以 UTC 存储，用户在 D1 控制台或前端直接查看时需要心算 +8，不直观。统一改为北京时间（UTC+8）方便日常查阅。

## What Changes

- **Worker** `isoNow()` 改为输出 UTC+8 时间字符串
- **Worker** `todayDate()` 改为基于 UTC+8 计算当日日期
- **Python** 侧所有写入时间戳的地方改为 UTC+8（`datetime.now(tz=timezone(timedelta(hours=8)))`）
- `k_date`、`archive_date` 等**日期字段**不变（业务逻辑基于交易日，已有明确语义）

## Capabilities

### New Capabilities

- `beijing-time-timestamps`: 系统所有时间戳字段统一使用北京时间（UTC+8）写入

### Modified Capabilities

（无 spec 级行为变化，仅实现层调整）

## Impact

**受影响文件：**
- `cloudflare/worker/src/index.js` — `isoNow()`、`todayDate()`
- `src/collect_news_v3.py` — `captured_at`、`updated_at` 等写入点
- `src/collect_prices.py` — 时间戳写入点
- `src/db_utils.py` — 时间戳写入点

**不影响：**
- `k_date`、`archive_date`、`pub_date` 等业务日期字段（语义明确，不做修改）
- 存量历史数据（不回填）
- D1 schema（字段类型不变，仍为 TEXT）
