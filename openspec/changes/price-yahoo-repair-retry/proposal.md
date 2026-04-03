## Why

价格主任务在北京时间清晨运行时，Yahoo Finance 可能短时返回异常或空值，导致 `stock_raw` 中出现“`k_date` 已写入，但 `current_price` 为空”的坏记录。后续即使 Yahoo 恢复，已有坏记录也不会自动修复，影响价格展示与下游分析。

与其在主链路中引入更复杂的多源 fallback，当前更需要一个克制的补偿机制：在主任务结束几个小时后，仅针对最近几天的空价格记录，再次使用 Yahoo 进行定向重试修复。

## What Changes

- 新增一个独立的“价格修复”定时任务，在北京时间 `08:00` 运行
- 仅扫描 `stock_raw` 中最近 `3` 天、且满足以下条件的记录：
  - `k_date` 非空
  - `current_price` 为空
- 对每条候选记录，使用同一个 `symbol` / `yahoo_symbol` 和该条记录的 `k_date`，再次向 Yahoo 查询该日价格
- 仅当 Yahoo 返回同一个 `k_date` 且价格非空时，更新原记录
- 第一阶段只重试 Yahoo，不引入 AKShare / Finnhub 等 secondary source
- 记录修复成功 / 跳过 / 失败日志，便于后续观察 Yahoo 短时故障恢复情况

## Capabilities

### New Capabilities

- `price-yahoo-repair-retry`: 对最近 3 天内已落库但价格为空的记录执行 Yahoo 定向重试修复

### Modified Capabilities

- `cross-market-price-query`: 增加主任务后的延迟修复链路，但不改变主任务的 Yahoo 取价逻辑

## Impact

- `src/` 价格采集相关模块：新增“按 `(symbol, k_date)` 重查 Yahoo”的修复入口
- 数据库写入链路：新增“按 `(symbol, k_date)` 更新已有坏记录”的修复写入语义
- GitHub Actions：新增一个北京时间 `08:00` 的修复调度
- 测试与文档：增加最近 3 天空价格记录的修复用例与运行说明
