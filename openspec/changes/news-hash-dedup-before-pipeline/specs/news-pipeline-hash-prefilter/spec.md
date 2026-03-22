## ADDED Requirements

### Requirement: Pipeline 入口 hash 预过滤
在 Stage 1 之前，系统 SHALL 从远端（或本地 DB）拉取当日已存在的 `news_hash` 集合，并过滤掉已处理的新闻，只有新增新闻进入三级漏斗。

#### Scenario: 正常预过滤
- **WHEN** `collect_all_news()` 执行，远端 hash 接口可访问
- **THEN** 系统拉取当日已存 hash 集合，去重后新闻中匹配的条目被跳过，仅新增条目进入 Stage 1

#### Scenario: 预过滤接口失败降级
- **WHEN** hash 接口调用失败（超时、网络错误等）
- **THEN** 系统记录 WARNING 日志，返回空 hash 集合，全量新闻进入 Stage 1，pipeline 不中断

#### Scenario: 本地环境从 SQLite 查询
- **WHEN** `context.is_local_env` 为 True
- **THEN** 系统直接查询本地 SQLite `news_raw_data` 表获取当日 hash，无需 HTTP 调用

### Requirement: 轻量 hash 查询接口
Workers API SHALL 提供 `GET /api/news/hashes?dateFrom=&dateTo=` 接口，返回指定时间范围内的 `news_hash` 列表。

#### Scenario: 正常查询
- **WHEN** 请求 `GET /api/news/hashes?dateFrom=2026-03-21 21:00:00&dateTo=2026-03-22 21:00:00`（过去 24 小时）
- **THEN** 返回 `{"hashes": [...], "count": N}`，查询 `WHERE pub_date >= ? AND pub_date < ?`

#### Scenario: 范围内无数据
- **WHEN** 请求的时间范围在数据库中无记录
- **THEN** 返回 `{"hashes": [], "count": 0}`，HTTP 200

### Requirement: pipeline_trace 记录预过滤数量
系统 SHALL 在 `pipeline_trace` 中新增 `prefilter_skipped` 字段，记录被 hash 预过滤跳过的新闻条数。

#### Scenario: 正常记录
- **WHEN** pipeline 完成
- **THEN** `pipeline_trace.prefilter_skipped` = 去重后总数 - 预过滤后剩余数
