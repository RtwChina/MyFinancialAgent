## 1. 实现收盘判断辅助函数

- [x] 1.1 在 `src/data_sources/price_live.py` 中新增 `EXCHANGE_CLOSE` 映射表（后缀规则 + 指数单独映射）
- [x] 1.2 实现 `resolve_exchange_close(yahoo_symbol)` → 返回 `(tz_str, close_hour, close_minute)`
- [x] 1.3 实现 `is_market_closed(last_candle_date, tz_str, close_hour, close_minute)` → 使用 `zoneinfo` 感知 DST

## 2. 集成到采集主逻辑

- [x] 2.1 在 `price_live.py` 取到 `hist.index[-1]` 后，调用 `is_market_closed` 判断是否需要回退
- [x] 2.2 回退时：`hist = hist.iloc[:-1]`，更新 `last_row` 和 `trading_date`
- [x] 2.3 无前日数据时（`len(hist) < 1`）：return None
- [x] 2.4 回退和跳过均输出 WARNING 日志，包含标的、原始 k_date、回退原因、实际使用 k_date

## 3. 测试

- [x] 3.1 冒烟测试：交易所解析和收盘判断逻辑验证通过（单元测试）
- [x] 3.2 冒烟测试：过去日期 K 线全部判定 closed=True，不触发回退
- [x] 3.3 日志格式已确认包含标的、当日K线日期、回退原因、实际使用 k_date

## 4. 发布

- [x] 4.1 发布前检查：`zoneinfo` 为 Python 3.9+ 标准库，Actions 环境已满足
- [ ] 4.2 合并代码，Actions 下次自动触发时观察日志无异常  ← 待下次 Actions 运行确认
