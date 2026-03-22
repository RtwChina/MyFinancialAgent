## ADDED Requirements

### Requirement: Finnhub 公司新闻并发查询

`fetch_finnhub_company()` SHALL 使用线程池并发查询多个标的的公司新闻，替代当前逐个串行 + 0.5s sleep 的方式。

**接口分类**：B 类（不可控，Finnhub 免费 API，30 calls/s rate limit）

**Mock 策略**：单元测试使用 `responses` 库 mock HTTP 调用，集成测试使用真实 API

#### Scenario: 正常并发查询

- **WHEN** 有 19 个美股标的需要查询 Finnhub company_news
- **THEN** 系统 SHALL 使用 `ThreadPoolExecutor` 并发查询，最大并发数不超过 5
- **THEN** 每个 worker 内部在连续请求间 SHALL 保留 0.2s 间隔以遵守 rate limit
- **THEN** 总耗时 SHALL 从 ~20s 降至 ~5s（19 标的 / 5 并发 × ~1s/标的）

#### Scenario: 单个标的查询失败

- **WHEN** 某个标的的 Finnhub API 调用超时或返回错误
- **THEN** 系统 SHALL 记录 error 日志并跳过该标的
- **THEN** 其他标的的查询 SHALL 不受影响，继续正常返回

#### Scenario: Finnhub API Key 未配置

- **WHEN** `FINNHUB_API_KEY` 未设置
- **THEN** 行为 SHALL 与当前一致：返回空列表，不报错

### Requirement: Finnhub 连接复用

并发查询 SHALL 使用共享的 `requests.Session` 复用 TCP 连接池，避免并发建连导致断连。

#### Scenario: 连接池复用

- **WHEN** 5 个并发 worker 同时查询 Finnhub API
- **THEN** 所有请求 SHALL 通过同一个 `requests.Session`（配置 `HTTPAdapter(pool_maxsize=10)`）发出
- **THEN** 不得出现 `RemoteDisconnected` 错误
