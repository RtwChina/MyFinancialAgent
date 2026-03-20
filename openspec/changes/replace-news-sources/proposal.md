## Why

当前新闻采集依赖自建爬虫（Sina/CLS/Jin10/Yahoo），内容仅抓取标题和简短摘要（平均 78-214 字），无法判断新闻准确性。爬虫方式不稳定，源站改版即失效。经本地对比测试（tests/news_quality_test.py），AkShare API + Finnhub API 组合可提供更长、更完整的新闻内容（平均 186-226 字），且全部走正规 API 接口，稳定性远高于爬虫。

## What Changes

- **移除** 现有四个爬虫源：`fetch_sina_finance()`、`fetch_cls_cn()`、`fetch_jin10()`、`fetch_yahoo_finance_news()`
- **新增** AkShare 新闻采集：财联社 (`stock_info_global_cls`)、同花顺 (`stock_info_global_ths`)、新浪 (`stock_info_global_sina`)、富途 (`stock_info_global_futu`)
- **新增** Finnhub 新闻采集：市场大盘新闻 (`general_news`) + 按标的查询公司新闻 (`company_news`)
- **修改** `fetch_all_news_live()` 编排逻辑，替换为新数据源并发调用
- **新增** Finnhub API Key 配置（环境变量 `FINNHUB_API_KEY`）
- **新增** 依赖：`akshare`、`finnhub-python`

## Capabilities

### New Capabilities
- `akshare-news-source`: 通过 AkShare API 采集中文财经新闻（财联社、同花顺、新浪、富途）
- `finnhub-news-source`: 通过 Finnhub API 采集英文财经新闻（大盘 + 个股）

### Modified Capabilities
（无已有 spec 的需求变更，仅替换数据源实现）

## Impact

- **代码**：`src/data_sources/news_live.py` 全面重写
- **依赖**：requirements.txt 新增 `akshare`、`finnhub-python`；可移除 `beautifulsoup4`（仅新闻爬虫使用，需确认其他模块是否依赖）
- **配置**：新增 `FINNHUB_API_KEY` 环境变量，需在 GitHub Actions secrets 和本地 `.env` 中配置
- **数据库**：`news_raw_data` 表新增 `language`（zh/en）和 `sub_source` 字段，需新增 migration
- **Worker**：`/api/ingest/news` 的 INSERT/SELECT 适配新字段
- **下游兼容**：新闻输出格式新增 language/sub_source 字段，现有字段（time/title/content/url/source）保持兼容
- **不做项**：不改变新闻筛选/LLM 增强/持久化等下游逻辑；不替换价格采集源
- **风险**：AkShare 接口底层仍依赖第三方站点，可能因源站变更而失效；Finnhub 免费版限频 60 calls/min
