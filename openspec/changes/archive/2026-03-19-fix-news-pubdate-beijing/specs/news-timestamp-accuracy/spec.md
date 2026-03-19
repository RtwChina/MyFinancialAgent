## MODIFIED Requirements

### Requirement: yahoo-source-beijing-time (replaces yahoo-source-ny-time)

所有新闻源（包括 Yahoo Finance）的 `time` / `pub_date` 字段统一存储**北京时间**（`Asia/Shanghai`，格式 `YYYY-MM-DD HH:MM:SS`）。

**Acceptance Criteria:**
- Yahoo pubDate=`"2024-03-19T03:00:00Z"`（UTC 03:00）→ 存储为 `"2024-03-19 11:00:00"`（北京时间）
- 新浪 ctime=1710816000（= 2024-03-19 12:00:00 UTC = 2024-03-19 20:00:00 CST）→ 存储为 `"2024-03-19 20:00:00"`
- 财联社 ctime 同上规则
- 金十 HH:MM:SS 页面时间拼上当日北京日期后直接存储

### Requirement: review-window-beijing-time (replaces review-window-timezone-consistent)

`get_analysis_window` 返回的起止时间字符串使用**北京时间**，与 `pub_date` 时区一致。

**Acceptance Criteria:**
- NYSE 收盘日 `analysis_date` 的窗口边界 = `_nyse_close_in_beijing(analysis_date-1)` → `_nyse_close_in_beijing(analysis_date)`
- EDT 期间（夏令时）：纽约 16:00 = 北京次日 04:00:00
- EST 期间（冬令时）：纽约 16:00 = 北京次日 05:00:00
- 时区换算通过 `ZoneInfo` 完成，不硬编码偏移量
