## ADDED Requirements

### Requirement: Finnhub 大盘新闻采集
系统 SHALL 通过 Finnhub `general_news("general")` 采集全球市场新闻。

接口分类：A 类（可控，官方 API + API Key）。Mock 策略：测试时 mock `finnhub.Client`。

#### Scenario: 正常采集大盘新闻
- **WHEN** 调用 Finnhub 大盘新闻采集函数
- **THEN** 返回 `list[dict]`，每条包含 time/title/content/url/source 字段，source 值为 `"finnhub"`

#### Scenario: Finnhub API Key 未配置
- **WHEN** 环境变量 `FINNHUB_API_KEY` 为空
- **THEN** 记录警告日志并跳过 Finnhub 采集，返回空列表

#### Scenario: Finnhub API 异常
- **WHEN** Finnhub API 调用抛出异常
- **THEN** 记录错误日志并返回空列表，不影响其他源

### Requirement: Finnhub 个股新闻采集
系统 SHALL 通过 Finnhub `company_news(symbol, _from, to)` 按跟踪的 stock + sector 类型 symbol 采集新闻。过滤掉 yahoo_symbol 含 `.SS`/`.SZ`/`.HK` 后缀的非美股 ticker（Finnhub 不支持 A 股/港股）。日期范围为最近 3 天（通过 `context.clock.now()` 计算），每个 symbol 最多取 10 条。

接口分类：A 类（可控）。Mock 策略：同上。

#### Scenario: 正常采集美股个股和 ETF 新闻
- **WHEN** tracked_symbols 中有 symbol_type 为 "stock" 或 "sector" 且 yahoo_symbol 为纯美股 ticker（如 MSFT, GOOGL, XLK, SOXX）
- **THEN** 对每个标的调用 company_news，返回合并后的 `list[dict]`，每条 source 值为 `"finnhub"`

#### Scenario: 跳过非美股标的
- **WHEN** tracked_symbols 中有 yahoo_symbol 含 `.SS`/`.SZ`/`.HK` 后缀的标的（如 515880.SS, 9988.HK）
- **THEN** 跳过这些标的，不调用 Finnhub API

#### Scenario: 限频控制
- **WHEN** 依次查询多个 symbol 的公司新闻
- **THEN** 每次调用间隔 SHALL 不小于 0.5 秒

### Requirement: Finnhub 新闻时间转换为北京时间
Finnhub 返回的 `datetime` 字段为 Unix 时间戳，系统 SHALL 将其转换为北京时间格式 `YYYY-MM-DD HH:MM:SS`。

#### Scenario: 时间戳转北京时间
- **WHEN** Finnhub 返回 `datetime: 1711036800`
- **THEN** 转换为北京时间字符串存入 time 字段

### Requirement: Finnhub API Key 配置
系统 SHALL 通过环境变量 `FINNHUB_API_KEY` 读取 API Key，在 `config.py` 中统一管理。

#### Scenario: Key 在 config.py 中注册
- **WHEN** 系统启动
- **THEN** `config.py` 中 SHALL 定义 `FINNHUB_API_KEY = os.getenv("FINNHUB_API_KEY", "")`
