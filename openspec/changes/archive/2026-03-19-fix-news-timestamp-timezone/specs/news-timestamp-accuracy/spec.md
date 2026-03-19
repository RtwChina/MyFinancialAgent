## ADDED Requirements

### Requirement: chinese-source-beijing-time
中文新闻源（新浪财经、财联社、金十数据）抓取的新闻，`time` / `pub_date` 字段必须存储**北京时间**（`Asia/Shanghai`，格式 `YYYY-MM-DD HH:MM:SS`），不得转换为其他时区。

**Acceptance Criteria:**
- 新浪 ctime=1710816000（= 2024-03-19 12:00:00 UTC = 2024-03-19 20:00:00 CST）→ 存储为 `"2024-03-19 20:00:00"`
- 财联社 ctime 同上规则
- 金十 HH:MM:SS 页面时间拼上当日北京日期后直接存储，不转换

### Requirement: yahoo-source-ny-time
Yahoo Finance 来源的新闻，`time` / `pub_date` 字段存储**纽约时间**（`America/New_York`，格式 `YYYY-MM-DD HH:MM:SS`）。

**Acceptance Criteria:**
- pubDate=`"2024-03-19T18:00:00Z"`（UTC 18:00）→ 存储为纽约时间等效值（EDT: `"2024-03-19 14:00:00"`）

### Requirement: review-window-timezone-consistent
`get_analysis_window` 返回的起止时间字符串须与 `pub_date` 字段时区一致（北京时间），以保证字符串范围过滤正确。

**Acceptance Criteria:**
- NYSE 收盘日 `analysis_date` 的窗口边界 = `(analysis_date-1 对应北京时间收盘等效时间)` 到 `(analysis_date 对应北京时间收盘等效时间)`
- 或采用宽松策略：窗口扩展为 ±24h，容忍中英文来源时区差异

### Requirement: display-accuracy
前端/API 返回的新闻 `pub_date` 字段展示时间，应与新闻在原始媒体上标注的发布时间一致（中文源误差 ≤ 1 分钟）。
