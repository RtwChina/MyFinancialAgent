# MyFinancialAgent — 股票自动化复盘系统

面向个人投资者的一体化股票复盘系统。自动采集美股/指数/板块价格与财经新闻，通过规则初筛 + LLM 精选过滤噪音，提供云端复盘工作台。

**技术栈：** Python 3.12 + Cloudflare Workers (JS) + Cloudflare D1 + 原生 HTML/CSS/JS

## 系统架构

```
GitHub Actions (定时) → Python 采集端 → Cloudflare Worker API → Cloudflare D1
                                                                      ↑
                                              Web 前端 (新闻浏览 + 复盘工作台) ─┘
```

- **价格采集**：yfinance → 40 个标的（21 指数 + 15 板块 + 4 个股）
- **新闻采集**：4 源（新浪/财联社/金十/Yahoo）→ 规则初筛 → LLM 批量精选 → 日期级 AI 汇总
- **复盘工作台**：待复盘日期 → 自动回填（价格+新闻+AI分析）→ 编辑保存

## 目录结构

```
.
├── .github/workflows/     # GitHub Actions 定时采集
├── cloudflare/
│   ├── migrations/        # D1 数据库迁移 (001-008)
│   ├── web/               # 前端 (HTML/CSS/JS)
│   └── worker/src/        # Cloudflare Worker API
├── docs/
│   ├── arch/              # 架构设计文档
│   └── rfcs/              # 需求文档 (PRD)
├── src/                   # Python 源代码
│   ├── data_sources/      # 数据源适配器 (Protocol-based)
│   ├── runtime/           # 运行时上下文 (Clock/Context)
│   ├── collect_prices.py  # 价格采集
│   ├── collect_news_v3.py # 新闻采集 + LLM 分析
│   ├── cloudflare_ingest.py # Worker API 客户端
│   ├── config.py          # 配置
│   ├── db_utils.py        # 本地 SQLite 工具
│   ├── llm_client.py      # LLM 客户端
│   ├── logger_utils.py    # 日志
│   └── symbol_registry.py # 标的注册表
├── tests/
│   ├── integration/       # 集成测试 (replay fixtures)
│   ├── smoke/             # 冒烟测试 (Playwright)
│   └── testdata/          # 测试数据与种子文件
├── main.py                # CLI 入口
├── schema.sql             # 数据库建表语句
└── wrangler.toml          # Cloudflare 配置
```

## 快速启动

```bash
# 1. 环境准备
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 2. 配置
cp .env.example .env
# 编辑 .env，填入 LLM_API_KEY、INGEST_API_BASE_URL 等

# 3. 运行
python main.py                # 全量：价格 + 新闻 + AI 总结
python main.py hourly-news    # 仅新闻采集
python main.py close-summary  # 收盘后：补采新闻 + 价格 + 汇总
```

## 定时任务

| 任务 | 频率 | 命令 |
|------|------|------|
| 新闻采集 | 每 4 小时 | `python main.py` (full) |
| 收盘汇总 | 每天北京 05:00 | `python main.py close-summary` |

## 环境

| 环境 | 分支 | Worker | D1 数据库 |
|------|------|--------|-----------|
| 生产 | `main` | `my-financial-agent.rtw1994.workers.dev` | `my-financial-agent` |
| 测试 | `test` | `my-financial-agent-test.rtw1994.workers.dev` | `my-financial-agent-test` |

## 测试

```bash
# 集成测试
.venv/bin/python tests/integration/run_weekly_integration.py \
  --worker-base https://my-financial-agent-test.rtw1994.workers.dev \
  --db-name my-financial-agent-test \
  --ingest-token "$INGEST_API_TOKEN"

# 生成历史基线 seed
.venv/bin/python tests/testdata/prepare_history_seed.py \
  tests/testdata/test_week_seed_20260315.sql \
  tests/testdata/_generated_history_seed.sql
```

## 文档

- [技术架构文档](docs/arch/TECHNICAL_ARCHITECTURE.md)
- [项目需求文档 (PRD)](docs/rfcs/项目需求文档.md)
