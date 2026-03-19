## Context

原始代码中，`news_live.py` 的 `_format_for_review_window` 函数将所有新闻时间戳转为纽约时间（`America/New_York`）。这导致：

1. 中文新闻源（Sina/财联社/金十）的发布时间偏差 -12h（EDT）或 -13h（EST）
2. `get_analysis_window` 返回纽约时间边界，而 `pub_date` 存纽约时间时二者一致；改为北京时间后必须同步修改，否则窗口过滤失效

**根本原因**：review window 过滤最初假设 `pub_date` 为纽约时间，`_format_for_review_window` 是为此设计的。随着需求变化（用户希望看到原始发布时间），时区规范改为北京时间，但 `get_analysis_window` 未同步更新。

## Goals / Non-Goals

**Goals:**
- 所有新闻 `pub_date` 存储北京时间，前端显示与原始媒体一致
- `get_analysis_window` 的窗口边界同步改为北京时间坐标系
- 夏令时（EDT/EST）自动处理，不硬编码时差偏移量

**Non-Goals:**
- 不修复历史存量数据（时区错误的旧数据，由 DB 重置+重采覆盖）
- 不改变 `_format_for_review_window` 函数（保留，供将来可能的 replay 模式使用）

## Decisions

### 决策 1：统一北京时间而非保留多时区

**选项 A（选定）**：所有源统一存北京时间，`get_analysis_window` 改用 `_nyse_close_in_beijing()`

**选项 B**：中文源存北京时间，Yahoo 存纽约时间，窗口用宽松 ±24h 策略

选 A 的原因：单一时区更简单，前端不需要判断来源；用户只需看「北京时间」标注即可理解。

### 决策 2：NYSE 收盘时刻用 ZoneInfo 动态换算

```python
def _nyse_close_in_beijing(date_str: str) -> str:
    ny_tz = ZoneInfo("America/New_York")
    bj_tz = ZoneInfo("Asia/Shanghai")
    close_ny = datetime.strptime(f"{date_str} 16:00:00", "%Y-%m-%d %H:%M:%S").replace(tzinfo=ny_tz)
    return close_ny.astimezone(bj_tz).strftime("%Y-%m-%d %H:%M:%S")
```

夏令时 EDT：纽约 16:00 = 北京次日 04:00
冬令时 EST：纽约 16:00 = 北京次日 05:00
ZoneInfo 自动处理，无需硬编码。

## Risks / Trade-offs

- **跨日窗口**：NYSE 收盘（16:00 NY）对应北京次日凌晨 4-5 点，窗口起止时间跨日期，字符串范围过滤 `pub_date >= start AND pub_date <= end` 仍然正确（日期字符串词典序与时间序一致）
- **历史数据**：旧数据 `pub_date` 为纽约时间，与新窗口不兼容 → 已通过 DB 重置解决

## Migration Plan

1. 修改 `news_live.py`（已完成，commit 56de0ef）
2. 修改 `collect_news_v3.py`（已完成，commit 56de0ef）
3. 重置 D1 数据库并重跑所有 migrations（已完成）
4. 等待下次 Actions 定时采集（每小时整点 UTC）或手动触发
5. 验证新采集的 `pub_date` 是否为北京时间
