## Why

`price_live.py` 直接取 yfinance `hist.iloc[-1]`（最后一根 K 线）作为收盘价，但 yfinance 在市场开盘期间会返回当天不完整的盘中 K 线（partial candle）。当用户在美股收盘前手动运行脚本（如 BJT 23:00 = ET 11:00），会将盘中价误存为当日"收盘价"，k_date 写成当天日期，导致价格数据不准确。自动化 Actions 在 BJT ~04:30（美股收盘后）运行不受影响，但该问题在手动触发或调度时间调整时会随时复现。

## What Changes

- **新增市场收盘判断**：在 `price_live.py` 中，取到最后一根 K 线后，检查其日期是否为当日（以该交易所所在时区判断）且当前时间是否早于收盘时间（美股 16:00 ET；大A 15:30 CST）。若市场尚未收盘，**自动回退到前一根 K 线**（上一个完整交易日收盘价）。
- **日志增强**：回退时输出 WARN 日志，说明回退原因和实际使用的 k_date，便于排查。
- 不改动采集调度逻辑，不影响正常 Actions 运行路径。

## Capabilities

### New Capabilities

- `price-complete-candle-guard`: 价格采集时自动跳过未收盘的当日 partial candle，保证写入数据库的永远是完整收盘价

### Modified Capabilities

（无）

## Impact

| 模块 | 变更类型 | 说明 |
|------|----------|------|
| `src/data_sources/price_live.py` | 逻辑修改 | 增加收盘状态判断，必要时回退到前一根 K 线 |
| `src/data_sources/price_base.py` | 可能涉及 | 若有公共工具函数则在此新增时区判断辅助方法 |
| GitHub Actions 自动化 | 无影响 | 正常在收盘后运行，回退逻辑不会触发 |
