## Context

当前 `src/data_sources/news_live.py` 在抓取中文新闻源（新浪、财联社、金十）后，调用 `_format_for_review_window` 将时间戳转换为纽约时区（`America/New_York`）再存入 `time` 字段。转换的初衷是保证 `pub_date` 字符串与 `get_analysis_window` 返回的 NYSE 收盘窗口（纽约时间 16:00-16:00）直接可比较。但副作用是：前端展示时间与新闻原始发布时间不符（北京早上 9 点 → 纽约前一天晚上 9 点）。

## Goals / Non-Goals

**Goals:**
- 中文新闻源（新浪、财联社、金十）的 `time`/`pub_date` 字段存储北京时间（`Asia/Shanghai`），不转换
- Yahoo Finance 的 `time`/`pub_date` 字段存储纽约时间（`America/New_York`），保持不变
- 复盘窗口过滤逻辑（`get_analysis_window` / `load_news_for_summary`）在与 `pub_date` 比较时采用**北京时间**边界，确保过滤结果正确

**Non-Goals:**
- 不回填/迁移历史已入库数据
- 不更改前端展示组件
- 不引入额外数据库字段

## Decisions

### 1. 时区存储策略：全部统一为北京时间

所有来源的 `time` / `pub_date` 字段统一存储**北京时间**（`Asia/Shanghai`，格式 `YYYY-MM-DD HH:MM:SS`）。

| 来源 | 原始时间 | 存储方式 |
|------|---------|---------|
| 新浪财经 | Unix ts (UTC) | `fromtimestamp(ts, tz=BEIJING_TZ).strftime(...)` |
| 财联社 | Unix ts (UTC) | 同上 |
| 金十数据 | 页面 HH:MM:SS（北京时间） | 拼上北京日期，直接 strftime |
| Yahoo Finance | ISO 8601 UTC | 解析为 UTC datetime，再 `.astimezone(BEIJING_TZ).strftime(...)` |

移除 `_format_for_review_window` 在各 fetch 函数中的调用，改用统一的 `_format_beijing_time(dt)` 辅助函数。

### 2. 复盘窗口边界：NYSE 收盘时刻换算为北京时间

`get_analysis_window` 不再硬编码 `"16:00:00"`，改为用 `ZoneInfo` 将 NYSE 收盘时刻（纽约 16:00）转换为北京时间等效字符串：

```python
def _nyse_close_in_beijing(date_str: str) -> str:
    close_ny = datetime.strptime(f"{date_str} 16:00:00", "%Y-%m-%d %H:%M:%S")
               .replace(tzinfo=ZoneInfo("America/New_York"))
    return close_ny.astimezone(ZoneInfo("Asia/Shanghai")).strftime("%Y-%m-%d %H:%M:%S")
```

夏令时自动处理（EDT → 次日 04:00 北京，EST → 次日 05:00 北京），无需手动维护偏移量。

`pub_date`（北京时间字符串）与窗口边界（也是北京时间字符串）直接比较，物理时间语义完全正确。

## Risks / Trade-offs

- **历史数据不一致**：已入库的历史 `pub_date` 为纽约时间，新数据为北京时间。两者混存时窗口过滤可能对历史数据产生误差（历史新闻被归入相差 12-13 小时的错误窗口）。→ 低优先级，历史数据不回填，接受该风险。
- **测试 fixture 需更新**：replay 数据中的时间字段格式依赖变更后的北京时间。→ 更新 testdata 即可。
