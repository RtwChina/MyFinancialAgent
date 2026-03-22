## ADDED Requirements

### Requirement: 新闻抓取窗口统一受控
系统 SHALL 在 `merge_and_deduplicate` 之前丢弃 `pub_date < now - 24h` 的所有新闻，保证进入 pipeline 的文章均在最近 2 天内。

#### Scenario: 正常截断
- **WHEN** 采集到的新闻中存在 `pub_date` 早于 `now - 24h` 的条目
- **THEN** 这些条目被丢弃，不进入 merge_and_deduplicate，日志记录丢弃数量

#### Scenario: 全部在窗口内
- **WHEN** 采集到的所有新闻 `pub_date` 均在 `now - 24h` 之后
- **THEN** 无条目被丢弃，pipeline 正常继续

#### Scenario: pub_date 为空
- **WHEN** 新闻条目 `pub_date`（或 `time`）字段为空或无法解析
- **THEN** 该条目不被截断（保留），进入后续流程正常处理

### Requirement: Finnhub company 抓取窗口为 2 天
系统 SHALL 查询 Finnhub company news 时使用 `date_from = today - 1天`，`date_to = today`（2 天窗口）。

#### Scenario: 正常查询
- **WHEN** `fetch_finnhub_company` 被调用
- **THEN** 查询参数 `date_from = (now - timedelta(days=1)).strftime("%Y-%m-%d")`，`date_to = now.strftime("%Y-%m-%d")`

### Requirement: hash 预过滤窗口与抓取窗口对齐
系统 SHALL 使用 2 天（24h）作为 hash 预过滤的时间窗口，与新闻抓取窗口保持一致。

#### Scenario: 预过滤窗口
- **WHEN** hash 预过滤执行
- **THEN** 查询 `pub_date >= now - 24h AND pub_date < now` 范围内的已存 hash
