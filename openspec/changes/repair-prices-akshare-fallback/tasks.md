## 1. Repair Fallback 路由

- [x] 1.1 在 `repair-prices` 链路中增加按市场分流逻辑：`.SS/.SZ -> AKShare`，`.HK` 与国际链路仅记录无可用 secondary source
- [x] 1.2 保持现有 Yahoo 修复优先级不变，仅在 Yahoo 未命中目标 `k_date` 时进入对应 fallback 分支
- [x] 1.3 为 repair 流程补充来源日志，区分 `Yahoo hit`、`Yahoo miss -> AKShare`、`AKShare hit/miss`、国际链路无可用 secondary source

## 2. 备用源指定日期修复

- [x] 2.1 新增按 `(symbol, yahoo_symbol, k_date)` 查询 AKShare 中国市场日线的 repair 逻辑
- [x] 2.2 国际链路不再实际请求 Finnhub 价格接口，仅记录跳过原因
- [x] 2.3 将 AKShare 返回统一映射为标准 price payload：`k_date`、`current_price`、`change_percent`、`volume`、`captured_at`
- [x] 2.4 仅当 AKShare 返回同一 `k_date` 且价格非空时，认定 fallback 修复成功

## 3. 修复写入复用

- [x] 3.1 复用现有 `(symbol, k_date)` repair update 语义，不新增新表
- [x] 3.2 确认 AKShare 成功返回后仍通过现有本地 / 远端 repair update 接口写回
- [x] 3.3 确认 Yahoo 已命中时不会触发备用源，也不会重复写回

## 4. 验证与发布

- [x] 4.1 手工验证：构造 `.SS/.SZ` 坏记录，确认 Yahoo miss 且 AKShare hit 时可修复
- [x] 4.2 手工验证：构造 `.HK` / 国际坏记录，确认 Yahoo miss 时只记录无可用 secondary source 并跳过
- [x] 4.3 手工验证：确认 AKShare 返回错日或空价格时不会更新原记录
- [x] 4.4 手工验证：确认 Yahoo 已命中时不会触发备用源
- [x] 4.5 发布前检查清单：
  - 确认主 `collect-prices` 逻辑未被改动
  - 确认新增逻辑只位于 `repair-prices` 链路
  - 确认线上 Worker / GitHub Actions 无需新增额外接口契约
  - 确认日志中可区分 Yahoo、AKShare 与国际链路跳过原因
