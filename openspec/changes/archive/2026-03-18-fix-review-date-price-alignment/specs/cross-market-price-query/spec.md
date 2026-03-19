## ADDED Requirements

### Requirement: 复盘页价格展示使用 per-symbol 最近记录语义

复盘页 bootstrap 接口 SHALL 使用"每个 symbol 取 `k_date <= archive_date` 的最近一条"查询策略，替代 `WHERE k_date = archive_date` 的精确等值查询。

此需求确保跨市场资产集合中，美股个股/板块（`k_date` 可能早于 `archive_date`）与亚洲指数/汇率/商品（`k_date` 可能等于 `archive_date`）均能在同一复盘页正常展示。

#### Scenario: archive_date 为 2026-03-17，美股个股 k_date 也为 2026-03-17

- **GIVEN** `stock_raw` 中 `MU` 的最新 `k_date = '2026-03-17'`，`archive_date = '2026-03-17'`
- **WHEN** 请求复盘页 bootstrap（`GET /api/reviews/2026-03-17/bootstrap`）
- **THEN** 响应中包含 `MU` 的价格数据

#### Scenario: archive_date 为 2026-03-17，亚洲指数 k_date 为 2026-03-18

- **GIVEN** `stock_raw` 中 `^HSI` 最新记录为 `k_date = '2026-03-18'`，`archive_date = '2026-03-17'`
- **WHEN** 请求复盘页 bootstrap（`GET /api/reviews/2026-03-17/bootstrap`）
- **THEN** `^HSI` 展示 `k_date = '2026-03-17'` 的数据（若存在），或不展示（若该日无数据）；不得展示 `k_date = '2026-03-18'` 的数据

#### Scenario: 跨市场混合——美股个股 k_date 落后一天

- **GIVEN** `stock_raw` 中同时存在：
  - `MU, k_date='2026-03-17'`
  - `MSFT, k_date='2026-03-17'`
  - `^HSI, k_date='2026-03-18'`
  - `GC=F, k_date='2026-03-18'`
  以及 `archive_date = '2026-03-17'`（由 `getLatestClosedNyseTradingDay` 返回）
- **WHEN** 请求复盘页 bootstrap
- **THEN** 响应包含 `MU`（`k_date='2026-03-17'`）、`MSFT`（`k_date='2026-03-17'`）
- **AND** `^HSI` 和 `GC=F` 若有 `k_date <= '2026-03-17'` 的记录则展示该记录，否则不展示

#### Scenario: 某标的在 archive_date 之前完全无数据

- **GIVEN** `tracked_symbols` 中有 `LITE`，但 `stock_raw` 中 `LITE` 无任何 `k_date <= archive_date` 的记录
- **WHEN** 请求复盘页 bootstrap
- **THEN** 响应中 `LITE` 不出现在价格列表中（不报错，不展示空行）
