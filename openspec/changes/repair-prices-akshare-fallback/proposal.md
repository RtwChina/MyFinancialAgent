## Why

`repair-prices` 已经能修复“Yahoo 短时异常后恢复”的空价格记录，但当 Yahoo 对某些标的长期缺少目标 `k_date` 的日线时，仅重试 Yahoo 仍然无法补齐。当前需要在修复任务内部增加按市场分流的二级补位，让已知 `k_date` 的坏记录在 Yahoo 缺日线时，仍能通过更适合对应市场的数据源修复。

## What Changes

- 在 `repair-prices` 任务中保留 `Yahoo` 作为第一优先修复源
- 当修复候选属于中国内地市场标的（`.SS` / `.SZ`）且 Yahoo 未返回目标 `k_date` 时，增加 `AKShare` 二级 fallback
- 当修复候选属于 `.HK`、美股或其他国际链路标的且 Yahoo 未返回目标 `k_date` 时，增加 `Finnhub` 二级 fallback
- fallback 仍然只针对已有坏记录执行，不改变主 `collect-prices` 任务逻辑
- 仅当备用源返回同一个 `k_date` 且价格非空时，更新原记录
- 为修复任务增加来源日志，区分 `Yahoo 修复命中`、`AKShare/Finnhub 修复命中`、`备用源也失败`

## Capabilities

### New Capabilities

- `repair-prices-akshare-fallback`: 为 repair-prices 增加按市场分流的 AKShare / Finnhub 指定日期 fallback

### Modified Capabilities

（无）

## Impact

- `src/repair_prices.py`：修复编排从“只重试 Yahoo”扩展为“Yahoo -> AKShare/Finnhub（按市场分流）”
- `src/data_sources/price_live.py` / 新增 repair source 模块：补充按 `k_date` 查询 AKShare / Finnhub 的修复逻辑
- `src/cloudflare_ingest.py` 与数据库更新链路：复用现有 repair update 语义，不新增新表
- 测试与文档：补充中国市场与国际标的在 Yahoo 缺目标日线时由备用源修复成功/失败的验证
