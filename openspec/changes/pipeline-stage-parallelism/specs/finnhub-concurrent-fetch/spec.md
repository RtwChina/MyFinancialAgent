## ADDED Requirements

### Requirement: Finnhub 公司新闻并发查询

`fetch_finnhub_company()` SHALL 使用线程池并发查询多个标的的公司新闻，替代当前逐个串行 + 0.5s sleep 的方式。

**接口分类**：B 类（不可控，Finnhub 免费 API，30 calls/s rate limit）

#### Scenario: 正常并发查询

- **WHEN** 有 19 个美股标的需要查询 Finnhub company_news
- **THEN** 系统 SHALL 使用 `ThreadPoolExecutor(max_workers=5)` 并发查询
- **THEN** 移除固定 0.5s sleep，改为 429 时 retry + backoff
- **THEN** 总耗时 SHALL 从 ~20s 降至 ~5s

#### Scenario: 单个标的查询失败

- **WHEN** 某个标的的 Finnhub API 调用超时或返回错误
- **THEN** 系统 SHALL 记录 error 日志并跳过该标的
- **THEN** 其他标的的查询 SHALL 不受影响

### Requirement: Finnhub 连接复用

并发查询 SHALL 使用共享的 `requests.Session` 复用 TCP 连接池。

#### Scenario: 连接池复用

- **WHEN** 5 个并发 worker 同时查询 Finnhub API
- **THEN** 所有请求 SHALL 通过共享 `requests.Session`（配置 `HTTPAdapter(pool_maxsize=10)`）发出
