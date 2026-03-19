## ADDED Requirements

### Requirement: 复盘列表 API 支持分页参数
`GET /api/reviews` 接口 SHALL 接受 `page`（默认 1）和 `pageSize`（默认 20，最大 100）参数，并返回分页元数据（`total`、`page`、`pageSize`、`totalPages`）。

#### Scenario: 分页返回复盘记录
- **GIVEN** 数据库中共有 45 条复盘记录
- **WHEN** 请求 `GET /api/reviews?page=2&pageSize=20`
- **THEN** 响应 `items` 含 20 条（第 21-40 条），`total: 45`，`totalPages: 3`

#### Scenario: 按状态过滤后分页
- **GIVEN** 状态为「已复盘」的记录共 12 条
- **WHEN** 请求 `GET /api/reviews?status=completed&page=1&pageSize=20`
- **THEN** `items` 含 12 条，`total: 12`，`totalPages: 1`

### Requirement: 复盘工作台前端显示分页控件
复盘记录列表下方 SHALL 显示与新闻检索台一致的分页控件（上一页/下一页/页码/每页条数/总条数）。

#### Scenario: 翻页加载复盘记录
- **GIVEN** 当前在第 1 页，共 3 页
- **WHEN** 用户点击「下一页」
- **THEN** 前端发起 `page=2` 请求，列表刷新

#### Scenario: 状态筛选变更后重置页码
- **GIVEN** 用户当前在第 2 页
- **WHEN** 用户切换状态筛选到「待开始」
- **THEN** 前端重置 page=1 并重新请求
