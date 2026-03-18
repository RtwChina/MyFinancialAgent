# MyFinancialAgent — 股票自动化复盘系统

Python 采集端 + Cloudflare Worker API + Cloudflare D1 数据库 + Web 前端的一体化股票复盘系统。

## 目录结构

```
.
├── .github/workflows/     # GitHub Actions（定时采集）
├── cloudflare/
│   ├── migrations/        # D1 数据库迁移文件
│   ├── web/               # 前端静态资源
│   └── worker/src/        # Cloudflare Worker 业务逻辑
├── docs/
│   ├── arch/              # 架构设计文档
│   ├── api/               # API 规格文档
│   └── rfcs/              # 需求与技术决策记录
├── scripts/               # 运维与数据初始化脚本
├── src/                   # Python 源代码
│   ├── data_sources/      # 价格/新闻数据源适配器
│   ├── runtime/           # 运行时上下文管理
│   ├── collect_prices.py  # 价格采集
│   ├── collect_news_v3.py # 新闻采集与 LLM 精筛
│   ├── cloudflare_ingest.py # Cloudflare Worker API 客户端
│   ├── config.py          # 配置（读取 .env）
│   ├── db_utils.py        # 本地 SQLite 工具
│   ├── llm_client.py      # LLM 客户端封装
│   ├── logger_utils.py    # 日志工具
│   └── symbol_registry.py # 标的主数据
├── tests/
│   ├── integration/       # 集成测试脚本与规范
│   ├── smoke/             # 冒烟测试（Playwright）
│   ├── testdata/          # 测试数据、种子文件、replay fixtures
│   ├── runs/              # 测试执行报告
│   └── standards/         # 测试总规范
├── main.py                # CLI 入口
├── schema.sql             # SQLite/D1 建表语句
├── wrangler.toml          # Cloudflare 生产环境配置
└── .env.example           # 环境变量示例
```

## 快速启动

```bash
# 1. 创建虚拟环境
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，填入 API keys

# 3. 运行任务
python main.py full           # 全量：价格 + 新闻 + AI 总结
python main.py hourly-news    # 小时新闻采集
python main.py close-summary  # 收盘后价格 + 日期汇总
```

## 测试

```bash
# 集成测试（测试环境）
.venv/bin/python tests/integration/run_weekly_integration.py \
  --worker-base https://my-financial-agent-test.rtw1994.workers.dev \
  --db-name my-financial-agent-test \
  --ingest-token "$INGEST_API_TOKEN"

# 生成历史基线 seed
.venv/bin/python tests/testdata/prepare_history_seed.py \
  tests/testdata/test_week_seed_20260315.sql \
  tests/testdata/_generated_history_seed.sql
```

## 环境

| 环境 | Worker | D1 |
|------|--------|----|
| 生产 | `my-financial-agent.rtw1994.workers.dev` | `my-financial-agent` |
| 测试 | `my-financial-agent-test.rtw1994.workers.dev` | `my-financial-agent-test` |
