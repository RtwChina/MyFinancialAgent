## 1. 代码修复

- [x] 1.1 `news_live.py`：添加 `_format_beijing_time()` 函数，替换所有四个 fetch 函数中的 `_format_for_review_window` 调用
- [x] 1.2 `collect_news_v3.py`：添加 `_nyse_close_in_beijing()` 函数，`get_analysis_window` 改用北京时间窗口
- [x] 1.3 `cloudflare/web/app.js`：新闻列表发布时间标注「北京时间」，新闻来源中文化

## 2. 数据库

- [x] 2.1 重置生产 D1 数据库（DROP 所有表 + re-run migrations 001~008）
- [x] 2.2 部署 Cloudflare Worker（`wrangler deploy`）

## 3. 验证

- [x] 3.1 确认 GitHub Actions 下次采集后 `pub_date` 为北京时间（预期格式 `YYYY-MM-DD HH:MM:SS`，时间与原始媒体一致）
- [x] 3.2 查询 D1 验证：`SELECT source, pub_date FROM news_raw_data ORDER BY created_at DESC LIMIT 10` 确认时间为北京时间段（早上/白天）
- [x] 3.3 前端页面确认「北京时间」标注显示正常，发布时间与实际新闻一致
