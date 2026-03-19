## Why

`news_live.py` 的四个新闻源函数原先调用 `_format_for_review_window`，将时间戳转换为纽约时区后存储。结果早上 9 点的北京财经新闻被存为前夜 21:xx（EDT），与用户看到的原始发布时间完全不符，复盘窗口过滤也因此错乱。

## What Changes

- `news_live.py`：所有四个 fetch 函数（Sina / 财联社 / 金十 / Yahoo）改用新增的 `_format_beijing_time()` 函数，所有 `pub_date` 统一存储**北京时间**
- `collect_news_v3.py`：`get_analysis_window` 改用 `_nyse_close_in_beijing()` 将纽约 16:00 收盘时刻换算为北京时间，保证窗口过滤与 `pub_date` 时区一致，夏令时自动处理
- `cloudflare/web/app.js`：新闻列表发布时间下方标注「北京时间」小字

## Capabilities

### New Capabilities

（无新能力，仅修复现有行为）

### Modified Capabilities

- `news-timestamp-accuracy`：`pub_date` 字段语义从「纽约时间」改为「北京时间」；review window 边界同步改为北京时间坐标系

## Impact

- `src/data_sources/news_live.py`：核心修改，影响所有新闻入库时间
- `src/collect_news_v3.py`：影响 `get_analysis_window` 窗口范围，进而影响复盘新闻过滤
- `cloudflare/web/app.js`：前端展示，不影响数据
- **不影响**：Worker ingest API、数据库 schema、现有历史数据（历史数据时区错误，需重新采集覆盖）
