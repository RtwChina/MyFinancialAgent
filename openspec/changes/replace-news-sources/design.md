## Context

当前 `src/data_sources/news_live.py` 通过 4 个自建爬虫函数采集新闻，输出统一格式 `list[dict]`（字段：time/title/content/url/source）。`fetch_all_news_live(context)` 使用 ThreadPoolExecutor 并发调用四个源，结果合并后返回给下游管道。

本地对比测试已验证 AkShare + Finnhub 可完全替代现有爬虫，内容质量更高、接口更稳定。

## Goals / Non-Goals

**Goals:**
- 用 AkShare API（财联社/同花顺/新浪/富途）替代现有中文爬虫（Sina/CLS/Jin10）
- 用 Finnhub API（general + company_news）替代 Yahoo Finance 爬虫
- `news_raw_data` 表新增 `language` 和 `sub_source` 字段，适配多源多语言
- Finnhub API Key 通过环境变量注入

**Non-Goals:**
- 不修改 LLM 精筛的评分标准和 prompt 结构（LLM 本身能理解英文，无需改动）
- 不修改价格采集模块
- 不增加华尔街见闻源（AkShare 已废弃该接口）

## Decisions

### 1. AkShare 源选择

选用 4 个已验证可用的快讯接口：

| 接口 | 源 | 条数 | 平均字数 | 选用原因 |
|---|---|---|---|---|
| `stock_info_global_cls()` | 财联社 | 20 | 226 | 内容最长，覆盖 A 股 + 全球 |
| `stock_info_global_ths()` | 同花顺 | 20 | 192 | 补充 A 股 + 全球视角 |
| `stock_info_global_sina()` | 新浪 | 20 | 186 | 55% 内容 >200 字 |
| `stock_info_global_futu()` | 富途 | 50 | 114 | 全球视角翻译稿，有标题+链接 |

不选用：eastmoney_global（东方财富，内容偏公告类质量一般）、caixin（太短，平均 53 字）、eastmoney 个股（表格数据居多）。

### 2. Finnhub 调用策略

- `general_news("general")` 获取全球大盘新闻，不需要传时间参数，自动返回最近约 24 小时的 100 条
- `company_news(symbol, _from, to)` 按标的查询公司/ETF 新闻

**Finnhub symbol 动态获取：**

```
symbol_registry.get_tracked_symbols()     ← 从 D1/本地SQLite 动态读取
    ↓ 过滤
symbol_type IN ("stock", "sector")        ← 个股 + ETF 板块
AND yahoo_symbol 不含 .SS/.SZ/.HK 后缀    ← 排除 A 股/港股（Finnhub 不支持）
    ↓
当前结果: 美股个股 5 + ETF 15 = 20 个
用户通过 Web 增删标的 → 下次采集自动生效
```

- 限频控制：每次 company_news 调用间隔 0.5s，20 次调用共 10s，远低于 60 calls/min 限制
- 日期范围：`_from` = 3 天前，`to` = 今天，通过 `context.clock.now()` 计算
- 每个 symbol 最多取 10 条



### 3. 并发策略

保持 ThreadPoolExecutor 模式。AkShare 4 个源 + Finnhub general 并发执行，Finnhub company_news 串行执行（限频）。

### 4. 函数签名变更

- AkShare 源不需要 `ExecutionContext`（无时间相关逻辑）
- Finnhub 需要 `ExecutionContext` 获取当前日期计算查询范围
- `fetch_all_news_live(context)` 签名不变

### 5. news_raw_data 表结构变更

新增两个字段：

```sql
ALTER TABLE news_raw_data ADD COLUMN language TEXT DEFAULT 'zh';
ALTER TABLE news_raw_data ADD COLUMN sub_source TEXT DEFAULT '';
```

**`source` + `sub_source` 的值映射：**

| 采集函数 | source | sub_source | language |
|---|---|---|---|
| fetch_akshare_cls | akshare | cls | zh |
| fetch_akshare_ths | akshare | 10jqka | zh |
| fetch_akshare_sina | akshare | sina | zh |
| fetch_akshare_futu | akshare | futu | zh |
| fetch_finnhub_general | finnhub | general | en |
| fetch_finnhub_company | finnhub | company | en |

**改动范围：**
- 新增 migration `008_news_language_subsource.sql`
- Worker `index.js` 的 INSERT/UPDATE/SELECT 语句加上 language 和 sub_source
- Python 采集端每条新闻 dict 输出新增 language 和 sub_source 字段
- `db_utils.py` 的 `upsert_news_data()` 适配新字段

### 6. API Key 管理

`FINNHUB_API_KEY` 通过 `config.py` 读取环境变量，与现有 `INGEST_API_TOKEN` 模式一致。GitHub Actions secrets 中需添加该变量。

### 7. 双语新闻筛选适配

新增 Finnhub 英文新闻后，`collect_news_v3.py` 的规则初筛必须能正确处理英文内容。当前筛选架构分两层：

- **静态词表** — `BASE_MACRO_KEYWORDS` 等硬编码关键词
- **动态词表** — LLM 根据新闻样本生成补充关键词，通过 `_merge_keywords()` 与静态词表合并

**两层都需要适配：**

#### 7.1 静态词表补充英文基础词

作为保底（`SKIP_LLM=true` 时仅使用静态词表），必须在静态词表中补充英文等价词：

| 词表 | 现状 | 补充内容 |
|---|---|---|
| `BASE_MACRO_KEYWORDS` | 18 词，仅 fed/cpi/ppi 3 个英文 | +interest rate, rate cut, rate hike, inflation, nonfarm, employment, tariff, sanctions, trade war, fiscal, liquidity, recession, debt ceiling, war, conflict, middle east, iran, israel, crude oil, oil price |
| `BASE_MARKET_KEYWORDS` | 18 词，仅 s&p/nasdaq/dow/ipo/ai/nvidia 6 个英文 | +earnings, revenue, buyback, dividend, merger, acquisition, regulation, chip, semiconductor, artificial intelligence, microsoft, google, apple |
| `BASE_NOISE_KEYWORDS` | 12 词，全部中文 | +analyst, rating, price target, bullish, bearish, buy rating, sell rating, technical analysis, premarket, afterhours, rumor |
| `BASE_SYMBOL_CONTEXT_KEYWORDS` | 10 词，全部中文 | +earnings, guidance, regulation, lawsuit, product, partnership, order, acquisition, buyback, revenue |

#### 7.2 动态规则 prompt 支持双语

`generate_dynamic_screening_profile()` 的 LLM prompt 当前全中文，需调整：

- system prompt 加："keywords 支持中英文短词，根据新闻样本语言产出对应语言的关键词"
- 确保英文新闻样本能被选入 `_build_rules_samples()`（已按 source 轮询，自然覆盖）

#### 7.3 不需要改动的部分

- **打分引擎** `apply_rule_filter()` — 已用 `.lower()` 做子串匹配，天然支持英文
- **标的匹配** `derive_related_symbols()` — 别名表已包含英文别名（Microsoft, Micron, S&P 500 等）
- **LLM 精筛** `_call_batch_llm()` — LLM 本身理解英文，prompt 要求输出中文摘要，无需改动
- **打分权重和阈值** — 不变

### 8. 前端来源适配

`cloudflare/web/app.js` 的 `NEWS_SOURCE_LABELS` 和 `index.html` 的 source `<select>` 硬编码了旧来源（sina/cls_cn/jin10/yahoo_finance），需新增 akshare 和 finnhub。

### 9. 不需要改动的部分（全链路确认）

| 位置 | 原因 |
|---|---|
| LLM 精筛 prompt（line 850 "必须使用中文"） | 用户界面中文，英文新闻翻译为中文摘要是正确行为 |
| 每日总结 prompt（line 1297-1340） | LLM 会自动翻译英文新闻为中文总结 |
| `_default_screening_profile()` include/exclude rules | 中文规则文本传给 LLM 理解无问题 |
| `apply_rule_filter()` 中文 fallback（"未命名新闻"/"规则保留"） | Finnhub 新闻都有标题，fallback 极少触发 |
| 内容截断 content[:500] / content[:180] | Finnhub 平均 207 字，500 不会截；180 会截但风险可接受 |
| `news_router.py` | 简单路由，不涉及语言/来源逻辑 |
| `derive_related_symbols()` | 别名表已含英文别名（Microsoft, Micron 等） |

## Risks / Trade-offs

- **[AkShare 接口失效]** → AkShare 底层仍依赖第三方站点。缓解：每个源独立 try/except，单源失败不影响其他源（与现有模式一致）
- **[Finnhub 限频]** → 免费版 60 calls/min。缓解：当前约 20 个 symbol + 0.5s 间隔，远低于限制。若用户大量增加标的，需关注调用次数
- **[beautifulsoup4 能否移除]** → 需确认其他模块是否使用。若有则保留依赖，不做强制移除
- **[测试/生产环境隔离]** → Finnhub API Key 在 test 和 main 分支各自配置 secrets，不跨环境
