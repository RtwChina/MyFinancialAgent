## 1. Python 侧

- [x] 1.1 在 `src/db_utils.py` 顶部新增工具函数 `now_cst() -> str`，返回 UTC+8 当前时间字符串（`ZoneInfo("Asia/Shanghai")`，格式 `%Y-%m-%d %H:%M:%S`）
- [x] 1.2 将 `src/db_utils.py` 中所有 `datetime.now().strftime(...)` 替换为 `now_cst()`（共约 4 处：L215、L302、L323、L427）
- [x] 1.3 将 `src/data_sources/price_live.py` 中 `context.clock.now().strftime(...)` 的 `captured_at` 写入改为北京时间（clock.now() 已返回 UTC+8，无需额外改动）
- [x] 1.4 将 `src/runtime/clock.py` 的 `SystemClock.now()` 改为返回带 UTC+8 tzinfo 的时间（`datetime.now(tz=ZoneInfo("Asia/Shanghai"))`），统一下游 `strftime` 无需再转换

## 2. Worker 侧

- [x] 2.1 修改 `cloudflare/worker/src/index.js` 的 `isoNow()`：改为 `new Date(Date.now() + 8*3600*1000).toISOString().slice(0,19).replace("T"," ")`
- [x] 2.2 修改 `todayDate()`（如有）：改为基于 UTC+8 计算当日日期

## 3. 验证

- [x] 3.1 本地验证 now_cst() 和 SystemClock().now() 均输出北京时间（2026-03-18 23:42:35 CST）
- [ ] 3.2 在前端触发一次操作，确认 D1 `updated_at` 显示北京时间
