## ADDED Requirements

### Requirement: repair-prices 为中国市场启用 AKShare 修复，并显式跳过国际备用源

系统 SHALL 在 `repair-prices` 任务中使用 `Yahoo` 作为第一优先修复源；当 Yahoo 未能返回目标 `k_date` 的有效价格时，系统 SHALL 对 `.SS` / `.SZ` 使用 `AKShare` 作为二级 fallback。对于 `.HK` 与国际链路标的，系统 SHALL 明确记录“当前无可用 secondary source”并跳过实际 fallback 请求。

#### Scenario: `.SS` 标的 Yahoo 缺目标日线，AKShare 命中

- **GIVEN** `stock_raw` 中存在一条坏记录，`yahoo_symbol = 515880.SS`、`k_date = 2026-04-02`、`current_price = NULL`
- **WHEN** `repair-prices` 任务先查询 Yahoo，且 Yahoo 未返回 `2026-04-02` 的价格
- **THEN** 系统继续使用 AKShare 查询该标的的 `2026-04-02`
- **AND** 若 AKShare 返回 `2026-04-02` 的非空价格，则系统允许修复该记录

#### Scenario: `.SZ` 标的 Yahoo 命中目标日线

- **GIVEN** `stock_raw` 中存在一条坏记录，`yahoo_symbol = 000001.SZ`、`k_date = 2026-04-02`、`current_price = NULL`
- **WHEN** `repair-prices` 任务查询 Yahoo 且 Yahoo 已返回 `2026-04-02` 的非空价格
- **THEN** 系统不得调用 AKShare
- **AND** 系统直接以 Yahoo 结果修复该记录

#### Scenario: `.HK` 标的 Yahoo 缺目标日线

- **GIVEN** `stock_raw` 中存在一条坏记录，`yahoo_symbol = 3067.HK`、`k_date = 2026-04-02`、`current_price = NULL`
- **WHEN** `repair-prices` 任务先查询 Yahoo，且 Yahoo 未返回 `2026-04-02` 的价格
- **THEN** 系统不得继续请求 Finnhub 价格接口
- **AND** 系统记录该标的当前无可用 secondary source，并跳过修复

### Requirement: AKShare 备用源必须命中同一 k_date

系统 SHALL 仅在 AKShare 返回与候选记录相同 `k_date` 的非空价格时，才认定 fallback 修复成功。

#### Scenario: AKShare 返回错日数据

- **GIVEN** `stock_raw` 中存在一条坏记录，`yahoo_symbol = 515880.SS`、`k_date = 2026-04-02`、`current_price = NULL`
- **WHEN** AKShare 只能返回 `2026-04-01` 的价格
- **THEN** 系统不得将该结果写回到 `2026-04-02` 的记录

#### Scenario: AKShare 返回目标日但价格为空

- **GIVEN** `stock_raw` 中存在一条坏记录，`yahoo_symbol = 515880.SS`、`k_date = 2026-04-02`、`current_price = NULL`
- **WHEN** AKShare 返回 `2026-04-02` 的记录但价格字段为空
- **THEN** 系统不得更新原记录

### Requirement: 修复日志必须区分来源与失败阶段

系统 SHALL 在 `repair-prices` 任务中记录修复来源与关键失败阶段，至少区分 Yahoo 命中、Yahoo 缺目标日线后转 AKShare、AKShare 命中/失败、国际链路无可用 secondary source。

#### Scenario: Yahoo miss 后 AKShare 命中

- **GIVEN** 一条 `.SS` 坏记录需要修复
- **WHEN** Yahoo 未命中目标 `k_date`，但 AKShare 命中并修复成功
- **THEN** 日志中必须能看出该记录经历了 `Yahoo miss -> AKShare hit`

#### Scenario: Yahoo miss 且 AKShare 也失败

- **GIVEN** 一条 `.SS` 坏记录需要修复
- **WHEN** Yahoo 与 AKShare 均未能返回目标 `k_date` 的有效价格
- **THEN** 日志中必须能看出该记录经历了 `Yahoo miss -> AKShare miss`

#### Scenario: Yahoo miss 后国际链路被显式跳过

- **GIVEN** 一条 `.HK` 或国际链路坏记录需要修复
- **WHEN** Yahoo 未命中目标 `k_date`
- **THEN** 日志中必须能看出该记录因为当前无可用 secondary source 而被跳过
