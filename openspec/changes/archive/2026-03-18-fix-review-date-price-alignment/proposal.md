## Why

当前系统的复盘日期和价格查询逻辑建立在"单市场"假设上，但系统已覆盖美股、亚洲指数、汇率、大宗商品等跨市场资产，导致复盘日被亚洲市场的更新日期错误推进，并且复盘页的美股个股/板块价格因 `k_date` 不匹配而全部消失。

## What Changes

- **Worker**：`getLatestPriceDate()` 改为按"最近已收盘 NYSE 交易日"计算，不再使用 `MAX(stock_raw.k_date)` 作为复盘候选日
- **Worker**：复盘页价格查询从 `k_date = archiveDate` 改为每个 symbol 取 `k_date <= archiveDate` 的最近一条记录
- **Python**：`collect_news_v3.py` 中 `close-summary` / `full` 命令落库时使用最近已收盘 NYSE 交易日，不再把未收盘当天推进为复盘日
- **统一概念**：在 Worker 和 Python 中各引入"最近已收盘 NYSE 交易日"的计算函数，替代当前混用的 `MAX(k_date)` 和 `get_current_review_trading_day()`

## Capabilities

### New Capabilities

- `nyse-closed-trading-day`: 统一定义"最近已收盘 NYSE 交易日"的计算逻辑（Worker 端 JS 函数 + Python 端函数），作为复盘日期的唯一来源
- `cross-market-price-query`: 复盘页价格展示改为按 symbol 各自取 `k_date <= archive_date` 的最近一条，支持跨市场资产日期不一致的场景

### Modified Capabilities

（无已有规格需要修改）

## Impact

**受影响文件：**
- `cloudflare/worker/src/index.js`
  - `getLatestPriceDate()` 函数（约 L1006）
  - 复盘页价格查询 SQL（约 L542）
- `src/collect_news_v3.py`
  - `run_news_pipeline()` 中 `close-summary` / `full` 落库路径（约 L1061, L1400）
  - `get_current_review_trading_day()` 函数的调用逻辑

**潜在风险：**
- NYSE 收盘判断逻辑需正确处理美国夏令时（EDT/EST 切换），避免引入新的时区 bug
- `hourly-news` 命令的原始新闻归档不应受影响，只约束 `daily_news_ai_analysis` 和 `daily_review_archive` 的落库日期

**不做项：**
- 不修改历史已归档复盘数据（不回填 `archive_date`）
- 不改变前端 UI 展示结构，只修复数据来源
- `hourly-news` 场景的原始新闻采集时间窗口保持不变
