## Context

`price_live.py` 调用 `ticker.history(period="1wk")` 获取最近一周日线数据，然后直接取 `hist.iloc[-1]` 作为收盘价。yfinance 在盘中会把当天已成交的部分数据作为最后一根 K 线返回（partial candle），此时 `hist.index[-1]` 等于今天的交易所本地日期，但 `Close` 是盘中价而非真实收盘价。

受影响的交易所及收盘时间（本地时区）：

| 资产类型 | 交易所时区 | 收盘时间 |
|----------|-----------|---------|
| 美股/美指/商品/汇率 | America/New_York (ET) | 16:00 |
| 大A / 上证 | Asia/Shanghai (CST) | 15:30 |
| 港股 / 恒生 | Asia/Hong_Kong (HKT) | 16:00 |
| 韩国 (KOSPI) | Asia/Seoul (KST) | 15:30 |
| 欧洲 (STOXX50E) | Europe/Berlin (CET/CEST) | 17:30 |

## Goals / Non-Goals

**Goals:**
- 采集时判断最后一根 K 线是否为当日 partial candle，若是则回退到 `hist.iloc[-2]`
- 回退行为写入 WARN 日志

**Non-Goals:**
- 不实时判断市场是否真正开盘（节假日、临时停市等）
- 不修改调度逻辑或 Actions 触发时间

## Decisions

### 判断方式：比较 K 线日期 vs 当前时间

```python
from zoneinfo import ZoneInfo
from datetime import datetime

def is_market_closed(last_candle_date, exchange_tz: str, close_hour: int, close_minute: int = 0) -> bool:
    """
    判断 last_candle_date 对应的市场是否已经收盘。
    若 last_candle_date < today_in_tz → 已收盘（昨日或更早数据，安全）
    若 last_candle_date == today_in_tz → 检查当前时间是否 >= 收盘时间
    若 last_candle_date > today_in_tz → 不应出现，视为已收盘（保守）
    """
    tz = ZoneInfo(exchange_tz)
    now_local = datetime.now(tz)
    today_local = now_local.date()
    close_time = now_local.replace(hour=close_hour, minute=close_minute, second=0, microsecond=0)
    if last_candle_date < today_local:
        return True
    if last_candle_date == today_local:
        return now_local >= close_time
    return True  # future date, treat as closed conservatively
```

**为什么不用 yfinance 的 `is_market_open`？** yfinance 没有公开稳定的此类 API，且引入额外网络请求。本地时间判断足够可靠，Actions 在 04:30 BJT 运行时不会误触发。

### 每个 yahoo_symbol 的交易所映射

在 `price_live.py` 中维护一张小型映射表，根据 yahoo_symbol 后缀或已知标识确定 `(exchange_tz, close_hour)`：

```python
EXCHANGE_CLOSE = {
    # 默认：美股 ET 16:00
    "default": ("America/New_York", 16, 0),
    # 后缀规则
    ".SS": ("Asia/Shanghai", 15, 30),   # 上交所
    ".SZ": ("Asia/Shanghai", 15, 30),   # 深交所
    ".HK": ("Asia/Hong_Kong", 16, 0),   # 港交所
    ".KS": ("Asia/Seoul", 15, 30),       # 韩交所
}
# 指数单独映射
SYMBOL_EXCHANGE_OVERRIDE = {
    "^KS11":    ("Asia/Seoul", 15, 30),
    "^STOXX50E":("Europe/Berlin", 17, 30),
    "^N225":    ("Asia/Tokyo", 15, 30),
}
```

### 回退逻辑

```python
last_candle_date = hist.index[-1].date()  # 交易所本地日期（yfinance 已转换）
tz, close_h, close_m = resolve_exchange_close(yahoo_code)
if not is_market_closed(last_candle_date, tz, close_h, close_m):
    if len(hist) < 2:
        logger.warning("%s 市场未收盘且无前日数据，跳过", yahoo_code)
        return None
    logger.warning("%s 市场尚未收盘（%s），回退到前一交易日 %s", yahoo_code, last_candle_date, hist.index[-2].date())
    hist = hist.iloc[:-1]  # 丢弃最后一根，用倒数第二根
```

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|----------|
| 交易所收盘时间不准（夏令时） | 使用 `zoneinfo` 感知 DST，不硬编码 UTC 偏移 |
| 新增标的交易所未在映射表中 | 默认 fallback 到美股 ET 16:00，记录 WARNING |
| hist 只有 1 根 K 线时无法回退 | return None 跳过该标的，上层已有容错逻辑 |
| 对 Actions 路径影响 | 04:30 BJT = ET 16:30，所有市场已收盘，`is_market_closed` 返回 True，不触发回退 |
