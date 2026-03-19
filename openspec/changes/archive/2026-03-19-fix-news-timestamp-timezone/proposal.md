## Why

`news_live.py` 的 `_format_for_review_window` 函数在入库前将所有新闻时间戳转换为纽约时区，导致中国新闻源（新浪、财联社、金十）的发布时间显示错乱——早上发布的新闻在前端显示为下午甚至前一天夜间。用户期望看到新闻的原始发布时间，而非复盘窗口归一化后的纽约时间。

## What Changes

- **修复** `src/data_sources/news_live.py`：中文新闻源（新浪、财联社、金十）直接存储北京时间，不再转换为纽约时间；Yahoo Finance 源保持 UTC 时间原样存储。
- **移除** `_format_for_review_window` 在各 fetch 函数中的调用（或改为仅供内部过滤使用）。
- **更新** `src/collect_news_v3.py` 的 `get_analysis_window` 与 `load_news_for_summary`：复盘窗口边界从纽约时间改为北京时间（或使用时区感知比较），确保过滤逻辑仍然正确。

## Capabilities

### New Capabilities
- `news-timestamp-accuracy`: 新闻发布时间字段（`pub_date` / `time`）存储原始发布时间（中文源用北京时间，英文源用 UTC/NY 时间），保证前端展示准确。

### Modified Capabilities
（无已有 spec 需变更）

## Impact

- **`src/data_sources/news_live.py`**：`_format_for_review_window` 调用点变更，或移除对中文源的调用。
- **`src/collect_news_v3.py`**：`get_analysis_window`、`load_news_for_summary` 中的窗口边界字符串需与 `pub_date` 时区保持一致。
- **数据库**：已入库的历史 `pub_date` 仍是纽约时间；新数据改为北京时间后需注意迁移说明（低优先级，历史数据不强制回填）。
- **前端/Worker**：只读展示，不受影响。
- **集成测试 fixture**：replay 模式下的时间字段格式需对齐更新。
