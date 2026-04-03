## ADDED Requirements

### Requirement: 最近 3 天空价格记录的 Yahoo 定向修复

系统 SHALL 提供一个独立的价格修复任务，用于扫描 `stock_raw` 中最近 `3` 天内 `k_date` 非空且 `current_price` 为空的记录，并针对这些记录使用 Yahoo 再次尝试修复价格。

#### Scenario: 选出最近 3 天坏记录

- **GIVEN** `stock_raw` 中存在多条价格记录
- **AND** 其中部分记录 `k_date` 非空且 `current_price` 为空
- **WHEN** 价格修复任务开始运行
- **THEN** 系统只选择最近 `3` 天窗口内满足条件的记录作为修复候选
- **AND** 不得选择 `k_date` 为空的 placeholder 记录

### Requirement: 修复必须命中原记录的 k_date

对于每条修复候选记录，系统 SHALL 以该记录已有的 `k_date` 为目标日期重新查询 Yahoo。只有当 Yahoo 返回同一个 `k_date` 的非空价格时，系统才可认定修复成功。

#### Scenario: Yahoo 返回同一 k_date 且价格非空

- **GIVEN** `stock_raw` 中存在一条记录，`symbol = 515880.SS`、`k_date = 2026-04-02`、`current_price = NULL`
- **WHEN** 修复任务重新向 Yahoo 查询该标的的 `2026-04-02` 价格
- **THEN** 如果 Yahoo 返回 `2026-04-02` 的非空收盘价，系统将该记录标记为修复成功

#### Scenario: Yahoo 返回不同 k_date

- **GIVEN** `stock_raw` 中存在一条记录，`symbol = 515880.SS`、`k_date = 2026-04-02`、`current_price = NULL`
- **WHEN** 修复任务查询 Yahoo
- **THEN** 如果 Yahoo 只能返回 `2026-04-01` 的价格，则系统不得将该结果写回到这条 `2026-04-02` 记录

#### Scenario: Yahoo 目标 k_date 仍为空

- **GIVEN** `stock_raw` 中存在一条记录，`symbol = 000001.SS`、`k_date = 2026-04-02`、`current_price = NULL`
- **WHEN** 修复任务查询 Yahoo
- **THEN** 如果 Yahoo 返回 `2026-04-02` 的记录但 `Close` 仍为空，系统不得更新原记录

### Requirement: 修复任务更新已有坏记录

当修复成功时，系统 SHALL 按 `(symbol, k_date)` 更新 `stock_raw` 中已存在的坏记录，而不是插入新记录。

#### Scenario: 修复成功后更新原记录

- **GIVEN** `stock_raw` 中已存在 `(symbol = 000001.SS, k_date = 2026-04-02)` 且 `current_price = NULL`
- **WHEN** 修复任务拿到同一 `k_date` 的有效价格
- **THEN** 系统更新该行的 `current_price`、`change_percent`、`volume` 与 `captured_at`
- **AND** 不新增第二条相同 `(symbol, k_date)` 的记录
