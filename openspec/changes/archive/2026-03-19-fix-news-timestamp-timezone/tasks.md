## 1. 修复中文新闻源时间戳（news_live.py）

- [x] 1.1 在 `news_live.py` 中新增 `_format_beijing_time(dt)` 辅助函数，将带时区的 datetime 转为北京时间字符串（`YYYY-MM-DD HH:MM:SS`）
- [x] 1.2 `fetch_sina_finance`：将 `_format_for_review_window(pub_time)` 替换为 `_format_beijing_time(pub_time)`
- [x] 1.3 `fetch_cls_cn`：同上，替换为 `_format_beijing_time(pub_time)`
- [x] 1.4 `fetch_jin10`：`pub_time` 已是北京时间 naive datetime，直接 `strftime` 输出，去掉 `_format_for_review_window` 调用
- [x] 1.5 `fetch_yahoo_finance_news`：将 UTC pubDate 转换为北京时间（`.astimezone(BEIJING_TZ)`），与中文源保持一致

## 2. 修复复盘窗口边界（collect_news_v3.py）

- [x] 2.1 在 `collect_news_v3.py` 中新增 `_nyse_close_in_beijing(date_str)` 辅助函数，用 `ZoneInfo` 将纽约 16:00 转换为北京时间字符串；修改 `get_analysis_window` 调用此函数替换原来的硬编码 `"16:00:00"`
- [x] 2.2 检查 `load_news_for_summary` 中的 `start_time <= item.get("pub_date", "") <= end_time` 过滤逻辑，确保与新时区一致

## 3. 前端标注

- [x] 3.1 `app.js` 新闻表格行（`timeCell`）：发布时间下方加 `<small class="muted">北京时间</small>` 小字标注
- ~~3.2 `app.js` 复盘新闻卡片（`review-news-item-foot`）~~ 不需要，卡片已有时间信息，不做标注

## 4. 验证与测试

- [x] 4.1 手动验证：在本地打印新浪/财联社/金十各一条新闻的 `time` 字段，确认为北京时间
- [x] 4.2 检查并更新 `tests/` 目录下涉及新闻时间字段的 replay fixture（testdata）中的时间格式
- [x] 4.3 运行现有集成测试，确认通过
