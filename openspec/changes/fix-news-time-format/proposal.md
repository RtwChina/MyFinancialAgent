## Why

`news_raw_data` 表的 `created_at` 字段使用 SQLite `DEFAULT CURRENT_TIMESTAMP`，存储的是 UTC 时间，而 `pub_date` 和 `captured_at` 存储的是北京时间。同一张表内三个时间字段时区不一致，违反项目"所有时间统一北京时间"的规范。该问题同样存在于其他使用 `DEFAULT CURRENT_TIMESTAMP` 的表（`stock_raw`、`tracked_symbols` 等）。

## What Changes

- 修改 `upsert_news_data()` 等写入函数，显式传入北京时间的 `created_at`，不再依赖 SQLite 默认值
- 同步修复其他表（`stock_raw`、`tracked_symbols`）中相同的 `created_at`/`updated_at` UTC 问题
- 修正 `news-timestamp-accuracy` spec 中 `yahoo-source-ny-time` 要求（从纽约时间改为北京时间，与代码实际行为一致）
- 清理 `_format_for_review_window()` 废弃函数
- 前端新闻列表：每条新闻的"北京时间"标签移到列头，单条显示简化为"HH:MM · 来源"

## Capabilities

### New Capabilities

无

### Modified Capabilities

- `news-timestamp-accuracy`: 将 `yahoo-source-ny-time` 要求从纽约时间改为北京时间；新增 `created_at` 统一北京时间的要求

## Impact

- **数据库写入**: `src/db_utils.py` 中涉及 INSERT 的函数需显式设置 `created_at` 为 `now_cst()`
- **代码清理**: `src/data_sources/news_live.py` 删除废弃函数
- **Spec**: `openspec/specs/news-timestamp-accuracy/spec.md` 同步更新
- **已有数据**: 仅12条新数据，`created_at` 偏差8小时，可通过简单 SQL 批量修正
- **前端**: `cloudflare/web/index.html` 列头、`cloudflare/web/app.js` 时间单元格显示调整
- **不影响**: `pub_date`、`captured_at` 已正确，采集逻辑无需改动
