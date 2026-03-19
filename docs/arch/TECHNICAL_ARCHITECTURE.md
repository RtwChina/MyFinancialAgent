# 技术架构文档 — MyFinancialAgent

> 最后更新: 2026-03-18

## 1. 系统概览

MyFinancialAgent 是一套面向个人投资者的**股票自动化复盘系统**，核心功能包括：

- 自动采集美股/指数/板块价格数据与财经新闻
- 基于规则初筛 + LLM 精选的多层新闻过滤
- 云端数据持久化（Cloudflare D1）
- 复盘工作台 Web 界面（查看、编辑、归档）

技术栈：**Python 3.12** + **Cloudflare Workers** (JS) + **Cloudflare D1** (SQLite) + **原生 HTML/CSS/JS** 前端。

## 2. 整体架构

```
┌─────────────────┐    定时触发     ┌───────────────────┐
│  GitHub Actions  │ ──────────────→│   main.py (入口)   │
│  (cron 调度)     │                │   Python 采集端    │
└─────────────────┘                └────────┬──────────┘
                                            │
                        ┌───────────────────┼───────────────────┐
                        ▼                   ▼                   ▼
               ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
               │ collect_prices│   │collect_news_v3│   │  LLM API     │
               │  (价格采集)   │   │  (新闻采集)   │   │ (Qwen/通义)  │
               └──────┬───────┘   └──────┬───────┘   └──────────────┘
                      │                  │
                      ▼                  ▼
               ┌──────────────────────────────────┐
               │   cloudflare_ingest.py            │
               │   (Worker API 客户端, HTTP POST)  │
               └──────────────┬───────────────────┘
                              │ HTTPS + Bearer Token
                              ▼
               ┌──────────────────────────────────┐
               │   Cloudflare Worker (index.js)    │
               │   ├─ /api/ingest/*  (写入接口)    │
               │   ├─ /api/news      (查询接口)    │
               │   ├─ /api/reviews/* (复盘接口)    │
               │   └─ /api/symbols   (标的管理)    │
               └──────────────┬───────────────────┘
                              │
                              ▼
               ┌──────────────────────────────────┐
               │       Cloudflare D1 (SQLite)      │
               │   6 张表 (详见 §5 数据模型)       │
               └──────────────────────────────────┘
                              ▲
                              │ fetch()
               ┌──────────────┴───────────────────┐
               │    Web 前端 (静态 HTML/CSS/JS)     │
               │    ├─ 新闻总览 (News Explorer)    │
               │    └─ 复盘工作台 (Review)          │
               └──────────────────────────────────┘
```

## 3. 模块详解

### 3.1 Python 采集端 (`src/`)

| 模块 | 职责 |
|------|------|
| `main.py` (根目录) | CLI 入口，3 种模式：`full` / `hourly-news` / `close-summary` |
| `config.py` | 环境变量读取，LLM/DB/Cloudflare 配置 |
| `collect_prices.py` | 价格采集：通过 `yfinance` 获取标的收盘价，支持实时/重放数据源 |
| `collect_news_v3.py` | 新闻采集主流程：4 源抓取 → 规则初筛 → LLM 批量精选 → 日期级汇总 |
| `cloudflare_ingest.py` | Cloudflare Worker API HTTP 客户端，封装所有远端写入/查询 |
| `db_utils.py` | 本地 SQLite 读写工具（开发调试用） |
| `llm_client.py` | 通用 LLM 客户端封装（支持重试、超时、JSON 解析） |
| `symbol_registry.py` | 标的注册表，管理 tracked_symbols 主数据 |
| `logger_utils.py` | 日志工具（文件 + 控制台双输出） |

### 3.2 数据源抽象层 (`src/data_sources/`)

采用 **Python Protocol** 实现结构化类型（structural typing），支持生产实时数据与测试重放数据的无缝切换。

```
data_sources/
├── protocols.py        # PriceSource / NewsSource Protocol 定义
├── price_live.py       # 实时价格源 (yfinance)
├── price_replay.py     # 测试价格重放源 (JSON fixtures)
├── news_live.py        # 实时新闻源 (4 渠道)
├── news_replay.py      # 测试新闻重放源 (JSON fixtures)
├── news_router.py      # 新闻源路由器 (统一调度 4 渠道)
├── news_sina.py        # 新浪财经数据源
├── news_cls.py         # 财联社数据源
├── news_jin10.py       # 金十数据数据源
└── news_yahoo.py       # Yahoo Finance 数据源
```

**Protocol 模式**：通过 `typing.Protocol` 定义接口契约，`ExecutionContext` 在运行时选择注入实时或重放数据源实现，无需修改业务逻辑代码。

### 3.3 运行时上下文 (`src/runtime/`)

| 模块 | 职责 |
|------|------|
| `context.py` | `ExecutionContext` 数据类：集中管理 `app_env`、`data_mode`、`clock`、`test_mode` |
| `clock.py` | `Clock` Protocol + `SystemClock` / `FixedClock` 实现，支持时间注入（测试固定时间） |

`build_execution_context()` 工厂函数根据环境变量自动构建上下文，决定使用实时还是重放数据源。

### 3.4 Cloudflare Worker (`cloudflare/worker/src/index.js`)

单文件 Worker，处理所有 API 路由。主要功能区：

**写入接口（需 Bearer Token 鉴权）：**

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/ingest/prices` | POST | 批量写入价格数据 (ON CONFLICT 幂等) |
| `/api/ingest/news` | POST | 批量写入新闻数据 (news_hash 去重) |
| `/api/ingest/news-analysis` | POST | 写入/更新日期级 AI 分析 |

**查询接口（公开）：**

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/health` | GET | 健康检查 |
| `/api/news` | GET | 新闻列表（支持分页、筛选） |
| `/api/symbols` | GET | 获取标的列表 |
| `/api/symbols/resolve` | POST | 符号解析 |
| `/api/symbols/validate` | POST | 符号校验 |
| `/api/reviews/pending` | GET | 待复盘日期列表 |
| `/api/reviews` | GET | 全量复盘列表 |
| `/api/reviews/:date` | GET | 单日复盘详情 |
| `/api/reviews/:date/bootstrap` | GET | 复盘回填数据（价格+新闻+AI分析+前日参考） |
| `/api/reviews/:date` | POST | 保存复盘草稿 |
| `/api/reviews/:date/complete` | POST | 标记复盘完成 |
| `/api/reviews/:date/initialize` | POST | 初始化复盘记录 |
| `/api/reviews/:date/delete` | POST | 删除复盘记录 |

**鉴权机制**：写入接口通过 `Authorization: Bearer <token>` 验证，token 存储在 Cloudflare Worker Secrets (`INGEST_API_TOKEN`)。

### 3.5 Web 前端 (`cloudflare/web/`)

纯静态前端，通过 Worker 的 `serveStaticAsset()` 直接提供服务。

| 文件 | 职责 |
|------|------|
| `index.html` | 主页面骨架，包含新闻总览和复盘工作台两个 Tab |
| `app.js` | 全部前端逻辑（API 调用、DOM 操作、事件处理） |
| `styles.css` | 样式表（暗色主题） |
| `content/` | 静态内容资源 |

**页面结构**：
1. **新闻总览 (News Explorer)**：搜索、筛选、分页浏览新闻，支持按日期/来源/类型/标的过滤
2. **复盘工作台 (Review Workspace)**：顶部待复盘日期横向卡片 + 复盘编辑区 + 底部全量复盘列表

## 4. 数据流

### 4.1 价格采集流程

```
GitHub Actions (cron 0 21 * * *)
  → python main.py close-summary
    → collect_prices.collect_all_prices(context)
      → PriceSource.fetch_prices()  [yfinance]
      → 计算最近已收盘交易日 T
      → 获取 tracked_symbols 中所有活跃标的
    → cloudflare_ingest.send_prices(prices_list)
      → POST /api/ingest/prices
        → INSERT INTO stock_raw ON CONFLICT DO UPDATE
```

### 4.2 新闻采集流程

```
GitHub Actions (cron 0 * * * *)
  → python main.py hourly-news
    → collect_news_v3.run_news_pipeline()
      ├─ Step 1: 多源抓取
      │   → news_router.fetch_all_news()
      │     → 并发: news_sina / news_cls / news_jin10 / news_yahoo
      │     → 合并 + 去重 (news_hash = MD5(title+source))
      │
      ├─ Step 2: 规则初筛 (LLM Rules)
      │   → LLM 判断每条新闻的 type / rule_passed / rule_reason
      │   → 过滤掉噪音新闻
      │
      ├─ Step 3: LLM 批量精选
      │   → 按 batch_size=6 分组
      │   → 并发 max_workers=2 调用 LLM
      │   → 返回: ai_summary / market_impact / importance_stars / related_symbols
      │
      ├─ Step 4: 写入 D1
      │   → POST /api/ingest/news (批量 upsert)
      │
      └─ Step 5: 日期级 AI 汇总
          → 基于当日所有有效新闻生成 daily summary
          → POST /api/ingest/news-analysis (upsert 覆盖)
          → POST /api/reviews/:date/initialize (初始化复盘记录)
```

### 4.3 复盘工作流程

```
用户打开 Web 页面
  → GET /api/reviews/pending → 待复盘日期列表
  → 点击某个日期 → GET /api/reviews/:date/bootstrap
    → Worker 返回: 价格 + 新闻 + AI分析 + 前日参考
  → 用户编辑复盘内容
  → POST /api/reviews/:date → 保存草稿
  → POST /api/reviews/:date/complete → 标记完成
```

## 5. 数据模型

### 5.1 表结构总览

| 表名 | 用途 | 主键/唯一约束 |
|------|------|---------------|
| `stock_raw` | 标的价格数据 | `UNIQUE(k_date, symbol)` |
| `news_raw_data` | 原始新闻（经初筛+LLM增强） | `UNIQUE(news_hash)` |
| `daily_review_archive` | 复盘存档主表 | `PRIMARY KEY(archive_date)` |
| `daily_news_ai_analysis` | 日期级 AI 新闻分析 | `PRIMARY KEY(analysis_date)` |
| `daily_review_archive_news` | 复盘快照新闻关联表 | `UNIQUE(archive_date, news_hash)` |
| `tracked_symbols` | 标的主数据管理 | `UNIQUE(symbol)` |

### 5.2 tracked_symbols 标的分类

| symbol_type | 数量 | 示例 |
|-------------|------|------|
| `index` | 21 | GSPC, NDX, DJI, VIX, HSI, SSE, DXY, GOLD, CL... |
| `sector` | 15 | XLK, SOXX, XLE, XLF, XLY, XLV, XLI, XLRE... |
| `stock` | 4 | MU, LITE, MSFT, GOOGL |

### 5.3 新闻处理状态机

```
抓取 → rule_screened (规则初筛)
  ├─ rule_passed=0 → 丢弃（不入库）
  └─ rule_passed=1 → llm_processed (LLM增强)
                       ├─ keep=true  → 写入 D1
                       └─ keep=false → llm_discarded
```

## 6. 部署架构

### 6.1 环境隔离

| 环境 | 分支 | Worker 域名 | D1 数据库 |
|------|------|-------------|-----------|
| 生产 | `main` | `my-financial-agent.rtw1994.workers.dev` | `my-financial-agent` |
| 测试 | `test` | `my-financial-agent-test.rtw1994.workers.dev` | `my-financial-agent-test` |

### 6.2 部署流程

```
代码提交 → test 分支
  → wrangler deploy -e test  (部署测试 Worker)
  → 集成测试验证
  → git merge test → main
  → wrangler deploy           (部署生产 Worker)
  → wrangler d1 migrations apply --remote  (生产 D1 迁移)
```

### 6.3 GitHub Actions 定时任务

| Workflow | 触发时间 | 运行模式 | 说明 |
|----------|----------|----------|------|
| `collect_news.yml` | 每 4 小时 (UTC 0,4,8,12,16,20) | `python main.py` (full) | 全量：价格+新闻+AI总结 |
| `collect_prices.yml` | 每天 UTC 21:00 (北京 05:00) | `python main.py close-summary` | 收盘后：补采新闻+价格+汇总 |

### 6.4 所需 Secrets

**GitHub Actions Secrets：**

| Secret | 用途 |
|--------|------|
| `LLM_API_KEY` | LLM 服务密钥 |
| `LLM_BASE_URL` | LLM 服务地址 |
| `LLM_MODEL_ID` | LLM 模型标识 |
| `INGEST_API_BASE_URL` | 生产 Worker API 地址 |
| `INGEST_API_TOKEN` | Worker 写入鉴权 Token |

**Cloudflare Worker Secrets：**

| Secret | 用途 |
|--------|------|
| `INGEST_API_TOKEN` | 验证来自 Python 采集端的写入请求 |

## 7. D1 迁移历史

| 序号 | 文件 | 内容 |
|------|------|------|
| 001 | `001_init.sql` | 初始表结构创建 |
| 003 | `003_rename_news_analysis_fields.sql` | 新闻分析字段重命名 |
| 004 | `004_drop_news_rule_score.sql` | 移除 rule_score 字段 |
| 005 | `005_review_archive_snapshot_and_ai_sources.sql` | 复盘快照与AI来源字段 |
| 006 | `006_drop_selected_news_ids.sql` | 移除 selected_news_ids 字段 |
| 007 | `007_tracked_symbols.sql` | 创建标的管理表 + 新闻类型迁移 |
| 008 | `008_stock_raw_symbol_remap.sql` | 价格表 symbol 标准化映射 |

## 8. 外部依赖

### 8.1 数据源

| 来源 | 类型 | 库/方式 |
|------|------|---------|
| Yahoo Finance | 价格+新闻 | `yfinance` Python 包 |
| 新浪财经 | 新闻 | HTTP 抓取 RSS |
| 财联社 | 新闻 | HTTP API |
| 金十数据 | 新闻 | HTTP API |

### 8.2 LLM 服务

| 任务 | 模型 | 说明 |
|------|------|------|
| 规则初筛 | `LLM_RULES_MODEL_ID` (默认 qwen3.5-plus) | 判断新闻类型与相关性 |
| 批量精选 | `LLM_BATCH_MODEL_ID` (默认 qwen3.5-flash) | 结构化摘要/影响分析 |
| 日报汇总 | `LLM_SUMMARY_MODEL_ID` (默认 qwen3.5-plus) | 生成日期级综合分析 |

### 8.3 Python 核心依赖

- `yfinance` — 股票数据获取
- `pandas` / `pandas_market_calendars` — 数据处理 & 交易日历
- `requests` — HTTP 请求
- `openpyxl` — Excel 导出
- `pytz` — 时区处理
- `python-dotenv` — 环境变量加载
- `openai` — LLM API 客户端（OpenAI 兼容格式）

## 9. 关键设计决策

### 9.1 sys.path 策略

`main.py` 保留在项目根目录作为 CLI 入口，通过 `sys.path.insert(0, 'src/')` 让所有 `src/` 内部 import 保持不变（`from config import ...`），无需重写任何内部模块的 import 语句。

### 9.2 Protocol-Based 数据源

使用 Python `typing.Protocol` 而非继承，实现结构化类型检查。生产环境注入实时数据源，集成测试注入 JSON fixture 重放数据源，业务代码完全无感。

### 9.3 新闻去重

使用 `news_hash = MD5(title + source)` 作为全局唯一标识，D1 通过 `UNIQUE(news_hash)` + `ON CONFLICT IGNORE` 保证幂等写入。

### 9.4 交易日锚定

所有时间计算基于 NYSE 交易日历（`pandas_market_calendars`），自动处理周末、节假日、夏令时。`T` = 最近一个已收盘交易日，新闻窗口 = `T-1_close` 到 `T_close`。

### 9.5 单 Worker 架构

Cloudflare Worker 单文件处理所有路由（写入 + 查询 + 静态资源），通过 `wrangler.toml` 的 `[site]` 配置提供前端静态文件。简单高效，适合单用户场景。
