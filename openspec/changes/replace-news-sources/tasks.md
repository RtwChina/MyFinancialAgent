## 1. 数据库 Migration

- [x] 1.1 新增 `cloudflare/migrations/009_news_language_subsource.sql`，给 `news_raw_data` 表添加 `language TEXT DEFAULT 'zh'` 和 `sub_source TEXT DEFAULT ''` 字段

## 2. 配置与依赖

- [x] 2.1 在 `config.py` 中新增 `FINNHUB_API_KEY = os.getenv("FINNHUB_API_KEY", "")`
- [x] 2.2 在 `requirements.txt` 中新增 `akshare>=1.18.0` 和 `finnhub-python>=2.4.0`（保留 `beautifulsoup4`，因 `collect_news_v3.py` 仍依赖）
- [ ] 2.3 在 `.env.example`（若存在）或文档中说明 `FINNHUB_API_KEY` 配置

## 3. AkShare 新闻源实现

- [x] 3.1 在 `news_live.py` 中新增 `fetch_akshare_cls()` — 调用 `stock_info_global_cls()`，返回统一格式 `list[dict]`，source=`"akshare"`, sub_source=`"cls"`, language=`"zh"`
- [x] 3.2 在 `news_live.py` 中新增 `fetch_akshare_ths()` — 调用 `stock_info_global_ths()`，sub_source=`"10jqka"`
- [x] 3.3 在 `news_live.py` 中新增 `fetch_akshare_sina()` — 调用 `stock_info_global_sina()`，sub_source=`"sina"`
- [x] 3.4 在 `news_live.py` 中新增 `fetch_akshare_futu()` — 调用 `stock_info_global_futu()`，sub_source=`"futu"`
- [x] 3.5 时间字段统一：CLS 需拼接 `发布日期`+`发布时间`；THS/FUTU 用 `发布时间`；Sina 用 `时间`；统一输出 `YYYY-MM-DD HH:MM:SS` 北京时间格式

## 4. Finnhub 新闻源实现

- [x] 4.1 在 `news_live.py` 中新增 `fetch_finnhub_general()` — 调用 `general_news("general")`，API Key 为空时跳过，source=`"finnhub"`, sub_source=`"general"`, language=`"en"`
- [x] 4.2 在 `news_live.py` 中新增 `fetch_finnhub_company(context)` — 从 `symbol_registry` 获取 stock + sector 类型标的，过滤掉 yahoo_symbol 含 `.SS`/`.SZ`/`.HK` 后缀的非美股 ticker，逐个调用 `company_news(symbol, _from=3天前, to=今天)`，间隔 0.5s，每个 symbol 最多 10 条，sub_source=`"company"`, language=`"en"`
- [x] 4.3 Finnhub 时间戳（UTC Unix）转北京时间 `YYYY-MM-DD HH:MM:SS`

## 5. 编排与集成

- [x] 5.1 重写 `fetch_all_news_live(context)` — 移除旧的四个爬虫调用，替换为 AkShare 4 源 + Finnhub 2 源，AkShare + Finnhub general 并发，Finnhub company 串行
- [x] 5.2 移除旧函数：`fetch_sina_finance()`、`fetch_cls_cn()`、`fetch_jin10()`、`fetch_yahoo_finance_news()`
- [x] 5.3 清理不再使用的 import（`yfinance`、`BeautifulSoup`、`re`、`json` 等仅被旧爬虫使用的模块）

## 6. Worker 适配

- [x] 6.1 `cloudflare/worker/src/index.js` — `/api/ingest/news` 的 INSERT 语句加上 `language` 和 `sub_source` 字段
- [x] 6.2 Worker 的 SELECT 查询（`/api/news`、`getReviewBootstrap` 等）按需返回 `language` 和 `sub_source`

## 7. Python 持久化适配

- [x] 7.1 `db_utils.py` 的 `upsert_news_data()` — INSERT 语句加上 `language` 和 `sub_source`
- [x] 7.2 `collect_news_v3.py` — 确保 cleaned dict 透传 `language` 和 `sub_source` 到入库流程

## 7b. 双语筛选适配

- [x] 7b.1 `collect_news_v3.py` — `BASE_MACRO_KEYWORDS` 补充英文等价词
- [x] 7b.2 `collect_news_v3.py` — `BASE_MARKET_KEYWORDS` 补充英文等价词
- [x] 7b.3 `collect_news_v3.py` — `BASE_NOISE_KEYWORDS` 补充英文等价词
- [x] 7b.4 `collect_news_v3.py` — `BASE_SYMBOL_CONTEXT_KEYWORDS` 补充英文等价词
- [x] 7b.5 `collect_news_v3.py` — `generate_dynamic_screening_profile()` 的 LLM prompt 加双语提示
- [x] 7b.6 `collect_news_v3.py` — `apply_rule_filter()` 的 cleaned dict 透传 `language` 和 `sub_source` 字段

## 7c. 前端来源适配

- [x] 7c.1 `cloudflare/web/app.js` — `NEWS_SOURCE_LABELS` 新增 `akshare: "AkShare"` 和 `finnhub: "Finnhub"` 映射
- [x] 7c.2 `cloudflare/web/index.html` — source `<select>` 下拉框新增 `akshare` 和 `finnhub` 选项

## 8. 测试

- [x] 8.1 本地运行新闻采集，验证输出格式（time/title/content/url/source/sub_source/language 均存在且格式正确）
- [x] 8.2 更新 `tests/standards/smoke-test.md` 追加新闻采集冒烟用例（SM-003/SM-004）
- [x] 8.3 更新 `tests/standards/integration-test.md` 追加集成测试用例（IT-NEWS-001）
- [ ] 8.4 执行冒烟测试并记录结果

## 9. 发布

- [ ] 9.1 发布前检查清单：
  - 确认 migration 009 已就绪
  - 确认 GitHub Actions secrets 已配置 `FINNHUB_API_KEY`
  - 确认 requirements.txt 依赖正确
  - 确认新闻输出格式下游兼容（pub_date 为北京时间字符串）
  - 确认旧爬虫代码已完全移除
- [ ] 9.2 提交代码至目标分支
- [ ] 9.3 合并到目标环境分支并部署
