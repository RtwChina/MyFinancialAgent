## ADDED Requirements

### Requirement: 新闻检索 API 支持分页参数
`GET /api/news` 接口 SHALL 接受 `page`（正整数，默认 1）和 `pageSize`（正整数，默认 20，最大 100）参数，并返回分页元数据。

#### Scenario: 请求第一页
- **GIVEN** 数据库中符合条件的新闻共 85 条
- **WHEN** 请求 `GET /api/news?page=1&pageSize=20`
- **THEN** 响应包含 `items`（20 条）、`total: 85`、`page: 1`、`pageSize: 20`、`totalPages: 5`

#### Scenario: 请求最后一页（不满页）
- **GIVEN** 共 85 条数据
- **WHEN** 请求 `GET /api/news?page=5&pageSize=20`
- **THEN** 响应 `items` 含 5 条，`total: 85`

#### Scenario: page 超出范围
- **GIVEN** 共 10 条数据
- **WHEN** 请求 `GET /api/news?page=99&pageSize=20`
- **THEN** 响应 `items` 为空数组，`total: 10`，HTTP 状态码 200

#### Scenario: 向后兼容（不传 page）
- **GIVEN** 请求未携带 `page` 参数
- **WHEN** 请求 `GET /api/news?limit=50`
- **THEN** 接口行为与原有 `limit` 逻辑一致，返回最多 50 条

### Requirement: 新闻检索台前端显示分页控件
检索结果列表下方 SHALL 显示分页控件，包含：上一页按钮、当前页码/总页数、下一页按钮、每页条数选择器（20/50/100）、总条数提示。

#### Scenario: 翻到下一页
- **GIVEN** 当前在第 1 页，共 3 页
- **WHEN** 用户点击「下一页」
- **THEN** 前端发起 `page=2` 请求，列表内容更新，页码显示变为 `2 / 3`

#### Scenario: 筛选条件变更后重置页码
- **GIVEN** 用户当前在第 3 页
- **WHEN** 用户修改关键字搜索条件并点击搜索
- **THEN** 前端重置 page=1 并发起新请求

#### Scenario: 结果为空时隐藏分页
- **GIVEN** 搜索无匹配结果，`total: 0`
- **WHEN** 前端渲染
- **THEN** 分页控件不显示

### Requirement: 新闻 symbol 和 stars 过滤移至服务端 WHERE 子句
`GET /api/news` 的 `symbol` 和 `stars` 过滤 SHALL 在数据库查询层执行，不得在应用层对全量结果筛选。

#### Scenario: symbol 过滤准确性
- **GIVEN** 数据库中有 500 条新闻，其中 `related_symbols` 含 `MU` 的有 30 条
- **WHEN** 请求 `GET /api/news?symbol=MU&page=1&pageSize=20`
- **THEN** `total: 30`，`items` 返回最新的 20 条含 MU 的新闻
